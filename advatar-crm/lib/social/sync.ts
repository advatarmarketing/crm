import "server-only";
import { seal, unseal } from "./crypto";
import { facebookData, instagramData, TokenProblem, type FetchedAccount, type FetchedPost } from "./meta";
import { tiktokData, tiktokRefresh } from "./tiktok";
import { metaConfigured, tiktokConfigured } from "./config";
import type { SocialPlatform } from "@/lib/social";

// The service-role client (lib/supabase/admin.ts) is untyped on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Today in London, as the snapshot's day — the agency's day, not UTC's. */
export function londonDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Save what a platform told us about one account: the account's own
 * numbers for today's snapshot, and its recent posts.
 */
export async function saveFetched(
  admin: Admin,
  conn: { id: string; client_id: string; platform: SocialPlatform },
  data: { account: FetchedAccount; posts: FetchedPost[] }
) {
  const now = new Date().toISOString();

  await admin
    .from("social_connections")
    .update({
      account_name: data.account.name,
      account_handle: data.account.handle,
      avatar_url: data.account.avatar,
      status: "connected",
      last_synced_at: now,
      last_error: null,
    })
    .eq("id", conn.id);

  // One row per account per day. Running the sync twice in a day just
  // overwrites that day with the newer numbers.
  await admin.from("social_snapshots").upsert(
    {
      client_id: conn.client_id,
      platform: conn.platform,
      day: londonDay(),
      followers: data.account.followers,
      following: data.account.following,
      posts_count: data.account.postsCount,
      taken_at: now,
    },
    { onConflict: "client_id,platform,day" }
  );

  if (data.posts.length) {
    await admin.from("social_posts").upsert(
      data.posts.map((p) => ({
        client_id: conn.client_id,
        platform: conn.platform,
        external_id: p.externalId,
        posted_at: p.postedAt,
        caption: p.caption ? p.caption.slice(0, 600) : null,
        thumbnail_url: p.thumbnail,
        permalink: p.permalink,
        is_video: p.isVideo,
        likes: p.likes,
        comments: p.comments,
        views: p.views,
        shares: p.shares,
        updated_at: now,
      })),
      { onConflict: "client_id,platform,external_id" }
    );
  }
}

/** Pull fresh numbers for one connected account. Never throws. */
export async function syncConnection(admin: Admin, connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: conn } = await admin
    .from("social_connections")
    .select("id, client_id, platform")
    .eq("id", connectionId)
    .maybeSingle();
  const { data: tok } = await admin.from("social_tokens").select("*").eq("connection_id", connectionId).maybeSingle();
  if (!conn || !tok) return { ok: false, error: "Not connected." };

  const fail = async (message: string, reconnect: boolean) => {
    await admin
      .from("social_connections")
      .update({ last_error: message.slice(0, 300), ...(reconnect ? { status: "needs_reconnect" } : {}) })
      .eq("id", connectionId);
    return { ok: false, error: message };
  };

  try {
    let access = unseal(tok.access_token);
    if (!access) return fail("The saved access couldn't be read. Connect the account again.", true);

    if (conn.platform === "tiktok") {
      if (!tiktokConfigured()) return fail("TikTok isn't set up on the server yet.", false);
      // Refresh when there's under two hours left (it lasts a day).
      if (!tok.expires_at || new Date(tok.expires_at).getTime() - Date.now() < 2 * 3600 * 1000) {
        const refresh = unseal(tok.refresh_token);
        if (!refresh) return fail("The saved access couldn't be read. Connect the account again.", true);
        const next = await tiktokRefresh(refresh);
        access = next.accessToken;
        await admin
          .from("social_tokens")
          .update({
            access_token: seal(next.accessToken),
            refresh_token: seal(next.refreshToken),
            expires_at: next.expiresAt,
            refresh_expires_at: next.refreshExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("connection_id", connectionId);
      }
      await saveFetched(admin, conn, await tiktokData(access));
    } else {
      if (!metaConfigured()) return fail("Facebook and Instagram aren't set up on the server yet.", false);
      const data = conn.platform === "instagram" ? await instagramData(tok.account_id, access) : await facebookData(tok.account_id, access);
      await saveFetched(admin, conn, data);
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "The platform didn't answer.";
    return fail(message, e instanceof TokenProblem);
  }
}

/** Every connected account (or one client's). Used by the daily job. */
export async function syncAll(admin: Admin, clientId?: string) {
  let q = admin.from("social_connections").select("id").eq("status", "connected");
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const row of (data ?? []) as { id: string }[]) {
    results.push({ id: row.id, ...(await syncConnection(admin, row.id)) });
  }
  return results;
}
