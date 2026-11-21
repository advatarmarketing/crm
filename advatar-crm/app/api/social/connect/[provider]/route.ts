import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { mayConnect, safeReturn } from "@/lib/social/connect";
import { signState } from "@/lib/social/crypto";
import { callbackUrl, metaConfigured, tiktokConfigured } from "@/lib/social/config";
import { metaAuthorizeUrl } from "@/lib/social/meta";
import { tiktokAuthorizeUrl } from "@/lib/social/tiktok";

export const dynamic = "force-dynamic";

/**
 * Step one of connecting an account: check who's asking, then send them
 * to Facebook or TikTok to sign in and approve read-only access.
 *
 * The `state` we send carries who started it and where to come back
 * to, signed so it can't be altered, and tied to a cookie on this
 * browser so a link someone else started can't be finished here.
 */
export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const url = new URL(request.url);
  const provider = params.provider === "tiktok" ? "tiktok" : params.provider === "meta" ? "meta" : null;
  const clientId = url.searchParams.get("client") ?? "";
  const back = safeReturn(url.searchParams.get("return"), "/app/portal/content");
  const fail = (msg: string) => {
    const to = new URL(back, url.origin);
    to.searchParams.set("social_error", msg);
    return NextResponse.redirect(to);
  };

  if (!provider || !/^[0-9a-f-]{36}$/i.test(clientId)) return fail("That link isn't right.");
  if (provider === "meta" && !metaConfigured()) return fail("Facebook and Instagram aren't switched on yet. Your team is setting this up.");
  if (provider === "tiktok" && !tiktokConfigured()) return fail("TikTok isn't switched on yet. Your team is setting this up.");

  const who = await mayConnect(createClient(), clientId);
  if (!who.ok) return fail(who.reason);

  const nonce = randomBytes(16).toString("base64url");
  const state = signState({ c: clientId, p: provider, u: who.userId, r: back, n: nonce, exp: Date.now() + 15 * 60 * 1000 });
  const redirectUri = callbackUrl(provider, url.origin);

  const res = NextResponse.redirect(provider === "meta" ? metaAuthorizeUrl(redirectUri, state) : tiktokAuthorizeUrl(redirectUri, state));
  res.cookies.set("social_nonce", nonce, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/social", maxAge: 15 * 60 });
  return res;
}
