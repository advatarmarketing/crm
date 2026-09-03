import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { ProfileRole } from "@/lib/supabase/types";

// Each role's home route, and the /app/* prefix it's allowed to be
// under. A role hitting any /app/* path outside its own prefix gets
// bounced to its home instead — this is a UX convenience only;
// row-level security in Postgres is what actually stops a role from
// reading data it shouldn't, so this list only ever needs to be as
// strict as the nav itself.
const HOME_BY_ROLE: Record<ProfileRole, string> = {
  ceo: "/app/dashboard",
  staff: "/app/dashboard",
  videographer: "/app/my-clients",
  client: "/app/portal",
};

// Route prefixes each role may access under /app/*. ceo and staff
// share the full CRM; videographer and client are scoped. Extend
// this in later phases as /app/payments, /app/my-payments, etc. are
// added — do not widen ceo/staff's "/app" catch-all casually once
// finance routes exist, since that's a UI convenience, not a
// substitute for RLS.
const ALLOWED_PREFIXES: Record<ProfileRole, string[]> = {
  ceo: ["/app"],
  staff: ["/app"],
  videographer: ["/app/my-clients", "/app/messages", "/app/my-payments"],
  client: ["/app/portal"],
};

function isAllowed(role: ProfileRole, pathname: string) {
  return ALLOWED_PREFIXES[role].some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
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
    return response;
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

  if (!isAllowed(role, pathname)) {
    const homeUrl = new URL(HOME_BY_ROLE[role], request.url);
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*"],
};
