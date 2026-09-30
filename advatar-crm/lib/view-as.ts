/**
 * "View their CRM" — letting a CEO look at the app exactly as another
 * person sees it, without signing in as them.
 *
 * How it works, because the shape of this matters more than any one
 * line of it:
 *
 *   - Entering the preview mints a short-lived access token for the
 *     target and puts it in an httpOnly cookie. The browser cannot
 *     read it; only the server ever sees it.
 *   - The cookie alone does nothing. A request is only treated as a
 *     preview when it ALSO carries `?_viewAs=1`, which only the
 *     preview window adds. So the CEO's own tabs, which never carry
 *     it, keep rendering as the CEO even though the cookie is sitting
 *     in the same browser.
 *   - middleware.ts is the only thing that may turn the cookie into a
 *     preview. It strips any incoming copy of the header below before
 *     doing anything else, so a request cannot arrive pretending to
 *     already be one.
 *   - Preview requests are refused unless they are GET or HEAD, which
 *     is what makes this a viewing tool rather than an impersonation
 *     one: no form, no button and no server action can write anything
 *     while it is open.
 *
 * The honest limit: the token is a real token for that person, and the
 * CEO's browser holds it while the window is open. That grants the CEO
 * nothing they did not already have — the same screen lets them set
 * that person's password outright — but it is the reason this is CEO
 * only, and the reason the token expires quickly.
 */

import type { ProfileRole } from "@/lib/supabase/types";

/**
 * The request header middleware stamps on a verified preview request,
 * and the only thing lib/supabase/server.ts looks at. Anything arriving
 * from outside with this name is deleted before it is read.
 */
export const VIEW_AS_HEADER = "x-advatar-view-as";

/** The httpOnly cookie holding the signed preview payload. */
export const VIEW_AS_COOKIE = "advatar_view_as";

/** The query parameter that opts a single request into the preview. */
export const VIEW_AS_PARAM = "_viewAs";

/** How long a preview lasts before it has to be reopened. */
export const VIEW_AS_MAX_AGE_SECONDS = 30 * 60;

/** Where each role's CRM starts. The preview opens on the target's. */
export const HOME_BY_ROLE: Record<ProfileRole, string> = {
  ceo: "/app/dashboard",
  operations_manager: "/app/dashboard",
  staff: "/app/dashboard",
  videographer: "/app/my-dashboard",
  client: "/app/portal",
};

export interface ViewAsPayload {
  /** The profile being viewed. */
  id: string;
  /** Their role, so middleware can route the preview to their pages. */
  role: ProfileRole;
  /** Their access token. Never leaves the server. */
  token: string;
  /** Epoch milliseconds. Checked on every request. */
  expires: number;
  /** Who opened it, re-checked on every request. */
  viewer: string;
}

// base64url, because a cookie value may not contain "+", "/" or "=".
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Returns the ArrayBuffer rather than a view of it, because that is
// what crypto.subtle.verify and TextDecoder both take directly.
function fromBase64Url(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/**
 * Web Crypto rather than node:crypto, because this same code has to
 * run in middleware, which is the Edge runtime and has no node:crypto.
 */
async function signingKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Signs the payload so its `role` and `viewer` cannot be edited. */
export async function sealViewAs(payload: ViewAsPayload): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await signingKey(), new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

/**
 * Returns the payload only if the signature matches and it has not
 * expired. Every failure returns null: a preview that cannot be proven
 * valid falls back to the viewer's own CRM, never to someone else's.
 */
export async function openViewAs(cookieValue: string | undefined): Promise<ViewAsPayload | null> {
  if (!cookieValue) return null;

  const [body, mac] = cookieValue.split(".");
  if (!body || !mac) return null;

  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      fromBase64Url(mac),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as ViewAsPayload;

    if (!payload?.id || !payload?.token || !payload?.viewer) return null;
    if (typeof payload.expires !== "number" || Date.now() > payload.expires) return null;

    return payload;
  } catch {
    // Malformed, truncated, or signed with a different key.
    return null;
  }
}

/** Adds the preview marker to a path, keeping any query already on it. */
export function withViewAs(path: string): string {
  const [before, hash] = path.split("#");
  const joiner = before.includes("?") ? "&" : "?";
  return `${before}${joiner}${VIEW_AS_PARAM}=1${hash ? `#${hash}` : ""}`;
}
