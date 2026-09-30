import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { VIEW_AS_HEADER } from "@/lib/view-as";
import type { Database } from "./types";

/**
 * Server-side Supabase client for use in Server Components, Server
 * Actions, and Route Handlers. Reads/writes the session via cookies.
 * Still runs as the signed-in user — RLS applies exactly as it would
 * in the browser. Do not use this for privileged operations; use
 * lib/supabase/admin.ts for those instead.
 *
 * One exception, and it is deliberately the only one: when middleware
 * has verified a "view their CRM" preview, it stamps the target's
 * access token onto the request and this returns a client running as
 * them instead. Everything above still holds — that client is an
 * ordinary signed-in user with their own RLS, not a privileged one,
 * which is exactly why the preview shows what they would really see
 * rather than an app-level guess at it.
 *
 * Only middleware.ts may set that header, and it deletes any copy
 * arriving from outside before it looks. Absent the header this
 * function behaves precisely as it always has, so normal requests run
 * down the same path as before.
 */
export function createClient() {
  const viewAsToken = headers().get(VIEW_AS_HEADER);
  if (viewAsToken) return createViewAsClient(viewAsToken);

  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component during render — safe to
            // ignore as long as middleware.ts is also refreshing the
            // session on every request.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Same as above.
          }
        },
      },
    }
  );
}

/**
 * A client running as the person being previewed.
 *
 * Built through createServerClient like the one above so both return
 * the same type and every call site stays unchanged. The cookie
 * handlers are deliberately inert: this client must never read the
 * viewer's session, and must never write a session back into the
 * viewer's browser. The token travels in the Authorization header
 * instead and dies with the request.
 */
function createViewAsClient(accessToken: string) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get() {
          return undefined;
        },
        set() {
          /* nothing: a preview never changes whose session this is */
        },
        remove() {
          /* nothing, same reason */
        },
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  );
}
