import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  HOME_BY_ROLE,
  VIEW_AS_COOKIE,
  VIEW_AS_HEADER,
  VIEW_AS_PARAM,
  openViewAs,
  withViewAs,
} from "@/lib/view-as";
import type { ProfileRole } from "@/lib/supabase/types";

// HOME_BY_ROLE — each role's home route — now lives in lib/view-as.ts,
// because the preview window has to open on the same page the person
// would land on themselves, and two copies of that map would drift.

// Route prefixes each role may access under /app/*. ceo and staff
// share the full CRM; videographer and client are scoped. Extend
// this in later phases as /app/payments, /app/my-payments, etc. are
// added — do not widen ceo/staff's "/app" catch-all casually once
// finance routes exist, since that's a UI convenience, not a
// substitute for RLS.
// Phase 19: every role gets /app/settings/password, and Phase 23
// /app/settings/profile — a client and a videographer both need
// somewhere to fix their own name, phone and photo. Logins are handed
// over with a temporary password, so a videographer or client with no
// way to reach this page would be stuck with theirs permanently. It's
// the only path under /app/settings that isn't management-only, and
// the page itself only ever changes the caller's own password.
const ALLOWED_PREFIXES: Record<ProfileRole, string[]> = {
  ceo: ["/app"],
  operations_manager: ["/app"],
  staff: ["/app"],
  videographer: [
    "/app/my-dashboard",
    "/app/calendar",
    "/app/todo",
    "/app/notes",
    "/app/my-calendar",
    "/app/my-work",
    "/app/uploads",
    "/app/my-clients",
    "/app/tools",
    "/app/guidelines",
    "/app/my-portfolio",
    "/app/messages",
    "/app/my-payments",
    "/app/settings/password",
    "/app/settings/profile",
  ],
  // Phase 24: a client's Calendar and To-do live under /app/portal, in
  // the portal's own tab row, rather than on the shared /app/calendar
  // and /app/todo pages the team uses — so the prefix list is
  // unchanged and there is one way in rather than two.
  // Uploads lives at /app/portal/uploads, inside the prefix they
  // already have, so nothing is added here — one way in rather than
  // two, same reasoning as Calendar and To-do in Phase 24.
  client: ["/app/portal", "/app/settings/password", "/app/settings/profile"],
};

function isAllowed(role: ProfileRole, pathname: string) {
  return ALLOWED_PREFIXES[role].some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export async function middleware(request: NextRequest) {
  // The headers forwarded to the app. The view-as header is deleted
  // first and unconditionally: it is the one thing that changes whose
  // data renders, so a request must never be able to arrive already
  // carrying it. Nothing below re-adds it except the verified branch.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(VIEW_AS_HEADER);

  // Session-refresh cookies are collected rather than written into a
  // response straight away, because the response is not built until
  // the end — the forwarded headers are still being decided.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const withCookies = (response: NextResponse) => {
    for (const c of pendingCookies) {
      response.cookies.set({ name: c.name, value: c.value, ...c.options });
    }
    return response;
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          pendingCookies.push({ name, value, options });
        },
        remove(name: string, options: CookieOptions) {
          pendingCookies.push({ name, value: "", options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAppRoute = pathname.startsWith("/app");

  if (!isAppRoute) {
    return withCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as ProfileRole | undefined;

  if (!role) {
    // No profile row somehow — treat as unauthenticated rather than
    // guessing a role.
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // ---------------------------------------------------------------
  // "View their CRM"
  // ---------------------------------------------------------------
  // Only requests that ask for it get it, so the CEO's ordinary tabs
  // are untouched by the cookie sitting in the same browser.
  if (request.nextUrl.searchParams.get(VIEW_AS_PARAM) === "1") {
    const preview = await openViewAs(request.cookies.get(VIEW_AS_COOKIE)?.value);

    // Every reason to refuse ends the same way: drop the marker and
    // show the viewer their own CRM. A preview that cannot be proven
    // valid must never fall through to somebody else's data.
    const ownView = () => {
      const url = request.nextUrl.clone();
      url.searchParams.delete(VIEW_AS_PARAM);
      return NextResponse.redirect(url);
    };

    // Re-checked here rather than trusted from the cookie, so ending
    // somebody's CEO access ends their open previews too.
    if (role !== "ceo") return ownView();
    if (!preview || preview.viewer !== user.id) return ownView();

    // What makes this a viewing tool rather than an impersonation one.
    // Server actions are POSTs to the page's own URL, so refusing
    // anything that isn't a read stops every form, button and action
    // in the app at once, without having to find them one by one.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse("This is a read-only preview.", { status: 403 });
    }

    // Route by the role being viewed, not the viewer's: a client's CRM
    // lives under /app/portal, and the CEO's own "/app" allowance
    // would otherwise let the preview sit on a page that person could
    // never reach.
    if (!isAllowed(preview.role, pathname)) {
      return NextResponse.redirect(new URL(withViewAs(HOME_BY_ROLE[preview.role]), request.url));
    }

    requestHeaders.set(VIEW_AS_HEADER, preview.token);
    return withCookies(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!isAllowed(role, pathname)) {
    const homeUrl = new URL(HOME_BY_ROLE[role], request.url);
    return NextResponse.redirect(homeUrl);
  }

  return withCookies(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ["/app/:path*"],
};
