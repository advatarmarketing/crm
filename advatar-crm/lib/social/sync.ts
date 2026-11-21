import "server-only";
import { seal, unseal } from "./crypto";
import { facebookData, instagramData, TokenProblem, type FetchedAccount, type FetchedPost } from "./meta";
import { tiktokData, tiktokRefresh } from "./tiktok";
import { metaConfigured, tiktokConfigured } from "./config";
import { isShortLink, postKey, socialKeys, type MatchPlatform } from "./match";
import { youtubeId, youtubeNumbers, youtubeOn } from "@/lib/performance/youtube";
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
  data: { account: FetchedAccount; posts: FetchedPost[] },
  /** "lookup": read through Advatar's Instagram from the profile link (0051). */
  status: "connected" | "lookup" = "connected"
) {
  const now = new Date().toISOString();

  await admin
    .from("social_connections")
    .update({
      account_name: data.account.name,
      account_handle: data.account.handle,
      avatar_url: data.account.avatar,
      status,
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

/** A vm.tiktok.com-style link, followed to where it really points. */
async function resolveShort(url: string): Promise<string> {
  if (!isShortLink(url)) return url;
  try {
    let at = url;
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(at, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
      const next = res.headers.get("location");
      if (!next) return at;
      at = new URL(next, at).toString();
      if (!isShortLink(at)) return at;
    }
    return at;
  } catch {
    return url;
  }
}

/** The post links the team has put on this client's videos for one platform, with their match keys. */
async function linkedPosts(admin: Admin, clientId: string, platform: MatchPlatform) {
  const { data, error } = await admin.from("video_posts").select("id, url").eq("client_id", clientId).eq("platform", platform);
  if (error) return [];
  const out: { id: string; key: string }[] = [];
  for (const row of (data ?? []) as { id: string; url: string }[]) {
    const key = postKey(platform, await resolveShort(row.url));
    if (key) out.push({ id: row.id, key });
  }
  return out;
}

/**
 * Copies the numbers the platform just reported onto every video post
 * link that points at the same post, so a video's "where it's posted"
 * numbers fill themselves in. Only numbers the platform actually gave
 * are written; a missing one never wipes out what was there.
 */
export async function applyToVideoPosts(
  admin: Admin,
  clientId: string,
  platform: MatchPlatform,
  links?: { id: string; key: string }[]
): Promise<number> {
  const wanted = links ?? (await linkedPosts(admin, clientId, platform));
  if (!wanted.length) return 0;
  const { data } = await admin
    .from("social_posts")
    .select("external_id, permalink, likes, comments, views, shares")
    .eq("client_id", clientId)
    .eq("platform", platform);
  const byKey = new Map<string, { likes: number | null; comments: number | null; views: number | null; shares: number | null }>();
  for (const p of (data ?? []) as { external_id: string; permalink: string | null; likes: number | null; comments: number | null; views: number | null; shares: number | null }[]) {
    for (const k of socialKeys(platform, p.external_id, p.permalink)) byKey.set(k, p);
  }

  let updated = 0;
  const now = new Date().toISOString();
  for (const link of wanted) {
    const p = byKey.get(link.key);
    if (!p) continue;
    const numbers: Record<string, number> = {};
    for (const m of ["views", "likes", "comments", "shares"] as const) if (typeof p[m] === "number") numbers[m] = p[m] as number;
    if (!Object.keys(numbers).length) continue;
    let { error } = await admin.from("video_posts").update({ ...numbers, metrics_at: now, metrics_source: "platform" }).eq("id", link.id);
    // Before 0049 the database only knows the older sources.
    if (error && /metrics_source/.test(error.message)) ({ error } = await admin.from("video_posts").update({ ...numbers, metrics_at: now, metrics_source: null }).eq("id", link.id));
    if (!error) updated++;
  }
  return updated;
}

/** YouTube links on videos: public numbers, refreshed with the daily run. */
export async function syncYoutubeLinks(admin: Admin, clientId?: string): Promise<number> {
  if (!youtubeOn()) return 0;
  let q = admin.from("video_posts").select("id, url").eq("platform", "youtube");
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) return 0;
  const rows = ((data ?? []) as { id: string; url: string }[]).map((r) => ({ ...r, yt: youtubeId(r.url) })).filter((r) => r.yt);
  if (!rows.length) return 0;
  const res = await youtubeNumbers(rows.map((r) => r.yt as string));
  if (!res.ok) return 0;
  let updated = 0;
  const now = new Date().toISOString();
  for (const r of rows) {
    const n = res.byId.get(r.yt as string);
    if (!n) continue;
    const numbers: Record<string, number> = {};
    if (n.views !== null) numbers.views = n.views;
    if (n.likes !== null) numbers.likes = n.likes;
    if (n.comments !== null) numbers.comments = n.comments;
    const { error: e } = await admin.from("video_posts").update({ ...numbers, metrics_at: now, metrics_source: "youtube" }).eq("id", r.id);
    if (!e) updated++;
  }
  return updated;
}

/** Pull fresh numbers for one connected account. Never throws. */
export async function syncConnection(admin: Admin, connectionId: string): Promise<{ ok: boolean; error?: string; linked?: number }> {
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
    const links = await linkedPosts(admin, conn.client_id, conn.platform);
    const wanted = new Set(links.map((l) => l.key));
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
      await saveFetched(admin, conn, await tiktokData(access, links.map((l) => l.key.slice(3))));
    } else {
      if (!metaConfigured()) return fail("Facebook and Instagram aren't set up on the server yet.", false);
      const data =
        conn.platform === "instagram"
          ? await instagramData(tok.account_id, access, wanted)
          : await facebookData(tok.account_id, access, wanted);
      await saveFetched(admin, conn, data);
    }
    return { ok: true, linked: await applyToVideoPosts(admin, conn.client_id, conn.platform, links) };
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
  const results: { id: string; ok: boolean; error?: string; linked?: number }[] = [];
  for (const row of (data ?? []) as { id: string }[]) {
    results.push({ id: row.id, ...(await syncConnection(admin, row.id)) });
  }
  return results;
}
