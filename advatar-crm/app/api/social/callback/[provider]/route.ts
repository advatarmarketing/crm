import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mayConnect, saveMetaPage, saveTikTok } from "@/lib/social/connect";
import { readState, seal } from "@/lib/social/crypto";
import { callbackUrl } from "@/lib/social/config";
import { metaExchangeCode, metaPages } from "@/lib/social/meta";
import { tiktokExchangeCode } from "@/lib/social/tiktok";
import { syncConnection } from "@/lib/social/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Step two: Facebook or TikTok sends the person back here with a code.
 * We swap it for access, save that encrypted, and pull the first set of
 * numbers straight away so the dashboard isn't empty until tomorrow.
 *
 * A Facebook login can manage several Pages. With one, it's used. With
 * more, the person is sent back with ?choose=… and picks which Page
 * (and its linked Instagram) belongs to this client.
 */
export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const url = new URL(request.url);
  const state = readState<{ c: string; p: string; u: string; r: string; n: string }>(url.searchParams.get("state"));
  const back = (extra: Record<string, string>) => {
    const to = new URL(state?.r ?? "/app/portal/content", url.origin);
    for (const [k, v] of Object.entries(extra)) to.searchParams.set(k, v);
    const res = NextResponse.redirect(to);
    res.cookies.set("social_nonce", "", { path: "/api/social", maxAge: 0 });
    return res;
  };

  const provider = params.provider;
  if (!state || state.p !== provider) return back({ social_error: "That sign-in expired. Please try again." });
  if (cookies().get("social_nonce")?.value !== state.n) return back({ social_error: "Please start connecting from this browser again." });

  const denied = url.searchParams.get("error_description") || url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (denied || !code) return back({ social_error: denied ? "Access wasn't approved, so nothing was connected." : "Nothing came back from the sign-in." });

  const who = await mayConnect(createClient(), state.c);
  if (!who.ok || who.userId !== state.u) return back({ social_error: who.ok ? "Please sign in as the person who started connecting." : who.reason });

  const admin = createAdminClient();
  const redirectUri = callbackUrl(provider as "meta" | "tiktok", url.origin);

  try {
    if (provider === "tiktok") {
      const tokens = await tiktokExchangeCode(code, redirectUri);
      const id = await saveTikTok(admin, state.c, tokens, who.userId);
      await syncConnection(admin, id);
      return back({ social_connected: "tiktok" });
    }

    const userToken = await metaExchangeCode(code, redirectUri);
    const pages = await metaPages(userToken);
    if (pages.length === 0) {
      return back({
        social_error:
          "No Facebook Page came through. Make sure you tick the business's Page when Facebook asks, and that its Instagram is a business or creator account linked to that Page.",
      });
    }
    if (pages.length === 1) {
      const ids = await saveMetaPage(admin, state.c, pages[0], who.userId);
      for (const id of ids) await syncConnection(admin, id);
      return back({ social_connected: "meta" });
    }

    const { data: pending, error } = await admin
      .from("social_pending")
      .insert({
        client_id: state.c,
        created_by: who.userId,
        user_token: seal(userToken),
        options: pages.map((p) => ({ pageId: p.pageId, pageName: p.pageName, igUsername: p.igUsername, pagePicture: p.pagePicture })),
      })
      .select("id")
      .single();
    if (error || !pending) throw new Error(error?.message ?? "Couldn't save the list of Pages.");
    return back({ choose: pending.id });
  } catch (e) {
    return back({ social_error: e instanceof Error ? e.message.slice(0, 200) : "Connecting didn't work. Please try again." });
  }
}
