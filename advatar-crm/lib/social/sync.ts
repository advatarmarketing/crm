import "server-only";
import { scanConfigured, scanPosts, scanProfile, ScanProblem, type Fetched, type Wanted } from "./scan";
import { isShortLink, postKey, socialKeys, type MatchPlatform } from "./match";
import { youtubeId, youtubeNumbers, youtubeOn } from "@/lib/performance/youtube";
import { SOCIAL_PLATFORMS, isSocialPlatform, type SocialPlatform, type SocialUrls } from "@/lib/social";

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
  data: Fetched,
  /** "lookup": read from the public profile link (0051). */
  status: "connected" | "lookup" = "lookup"
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
export async function linkedPosts(admin: Admin, clientId: string, platform: MatchPlatform) {
  const { data, error } = await admin.from("video_posts").select("id, url").eq("client_id", clientId).eq("platform", platform);
  if (error) return [];
  const out: { id: string; key: string; url: string }[] = [];
  for (const row of (data ?? []) as { id: string; url: string }[]) {
    const url = await resolveShort(row.url);
    const key = postKey(platform, url);
    if (key) out.push({ id: row.id, key, url });
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

const DAY = 24 * 3600 * 1000;

/**
 * One client, every platform: the profiles the team linked on their
 * Performance tab are read in full, and post links on their videos for
 * a platform with no profile link are read one by one. Never throws.
 *
 * `deep` goes back to the day we started posting (90 days at most) for
 * a first read or when the team presses Save or Refresh; the daily run
 * only goes back 30 days, which keeps the credits it uses down.
 */
export async function scanClient(
  admin: Admin,
  clientId: string,
  opts: { deep?: boolean } = {}
): Promise<{ platform: SocialPlatform; ok: boolean; error?: string; linked: number }[]> {
  if (!scanConfigured()) return [];
  const { data: client, error } = await admin
    .from("clients")
    .select("social_platforms, social_urls, posting_started_on")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !client) return [];
  const urls = (client.social_urls ?? {}) as SocialUrls;
  const chosen = ((client.social_platforms ?? []) as string[]).filter(isSocialPlatform);
  const started: string | null = client.posting_started_on ?? null;

  const { data: rows } = await admin.from("social_connections").select("id, platform, last_synced_at").eq("client_id", clientId);
  const existing = new Map<string, { id: string; last_synced_at: string | null }>(
    ((rows ?? []) as { id: string; platform: string; last_synced_at: string | null }[]).map((r) => [r.platform, r])
  );

  const one = async (platform: SocialPlatform) => {
    const link = chosen.includes(platform) ? urls[platform] : undefined;
    const links = await linkedPosts(admin, clientId, platform);
    const due = opts.deep ? links : await dueForRead(admin, clientId, platform, links);

    if (!link) {
      // No profile to read: just the posts linked on videos, if any.
      if (!links.length) return null;
      const posts = due.length ? await scanPosts(platform, due) : [];
      if (posts.length) await savePosts(admin, clientId, platform, posts);
      return { platform, ok: true, linked: await applyToVideoPosts(admin, clientId, platform, links) };
    }

    let row = existing.get(platform);
    if (!row) {
      const { data: made, error: makeError } = await admin
        .from("social_connections")
        .upsert({ client_id: clientId, platform, status: "lookup", connected_at: new Date().toISOString() }, { onConflict: "client_id,platform" })
        .select("id, last_synced_at")
        .single();
      if (makeError || !made) return { platform, ok: false, error: makeError?.message ?? "Couldn't save.", linked: 0 };
      row = made as { id: string; last_synced_at: string | null };
    }

    const deep = opts.deep || !row.last_synced_at;
    const back = new Date(Date.now() - (deep ? 90 : 30) * DAY);
    const since = deep && started && new Date(`${started}T00:00:00Z`) > back ? new Date(`${started}T00:00:00Z`) : back;
    try {
      const data = await scanProfile(platform, link, { since, maxPages: deep ? 8 : 3 }, (deep ? links : due) as Wanted);
      await saveFetched(admin, { id: row.id, client_id: clientId, platform }, data, "lookup");
      return { platform, ok: true, linked: await applyToVideoPosts(admin, clientId, platform, links) };
    } catch (e) {
      const message = e instanceof ScanProblem ? e.message : "The profile couldn't be read just now. It will try again tomorrow.";
      await admin.from("social_connections").update({ last_error: message.slice(0, 300) }).eq("id", row.id);
      return { platform, ok: false, error: message, linked: 0 };
    }
  };

  // The three platforms at once: each is a handful of slow requests.
  const settled = await Promise.allSettled(SOCIAL_PLATFORMS.map((p) => one(p.id)));
  const out: { platform: SocialPlatform; ok: boolean; error?: string; linked: number }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value) out.push(r.value);
    } else {
      out.push({ platform: SOCIAL_PLATFORMS[i].id, ok: false, error: r.reason instanceof Error ? r.reason.message : "Didn't update.", linked: 0 });
    }
  });
  return out;
}

/**
 * Which linked posts are worth a one-off read today. Each costs a
 * credit, so a post older than a month (its numbers barely move) is
 * read once a week rather than every day; anything not read yet, or
 * newer, is read daily.
 */
async function dueForRead(admin: Admin, clientId: string, platform: MatchPlatform, links: { id: string; key: string; url: string }[]) {
  if (!links.length) return links;
  const { data } = await admin.from("social_posts").select("external_id, permalink, posted_at, updated_at").eq("client_id", clientId).eq("platform", platform);
  const settled = new Set<string>();
  const monthAgo = Date.now() - 30 * DAY;
  const weekAgo = Date.now() - 7 * DAY;
  for (const p of (data ?? []) as { external_id: string; permalink: string | null; posted_at: string; updated_at: string | null }[]) {
    if (new Date(p.posted_at).getTime() >= monthAgo) continue;
    if (!p.updated_at || new Date(p.updated_at).getTime() < weekAgo) continue;
    for (const k of socialKeys(platform, p.external_id, p.permalink)) settled.add(k);
    if (platform === "instagram") settled.add(`ig:${p.external_id}`);
  }
  return links.filter((l) => !settled.has(l.key));
}

/** Posts read one by one, saved without touching the account's numbers. */
export async function savePosts(admin: Admin, clientId: string, platform: SocialPlatform, posts: Fetched["posts"]) {
  const now = new Date().toISOString();
  await admin.from("social_posts").upsert(
    posts.map((p) => ({
      client_id: clientId,
      platform,
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

/**
 * The daily run: every client with a profile link or a post link on a
 * video. Least recently updated first, a few at a time, and it stops
 * starting new ones near Vercel's time limit; whoever is left over goes
 * first tomorrow.
 */
export async function scanAll(admin: Admin, budgetMs = 240_000) {
  if (!scanConfigured()) return [];
  const started = Date.now();
  const [{ data: withLinks }, { data: withPosts }, { data: conns }] = await Promise.all([
    admin.from("clients").select("id, social_urls"),
    admin.from("video_posts").select("client_id").in("platform", ["instagram", "tiktok", "facebook"]),
    admin.from("social_connections").select("client_id, last_synced_at"),
  ]);
  const ids = new Set<string>();
  for (const c of (withLinks ?? []) as { id: string; social_urls: SocialUrls | null }[]) {
    if (c.social_urls && Object.values(c.social_urls).some(Boolean)) ids.add(c.id);
  }
  for (const p of (withPosts ?? []) as { client_id: string }[]) ids.add(p.client_id);
  const last = new Map<string, string>();
  for (const c of (conns ?? []) as { client_id: string; last_synced_at: string | null }[]) {
    const prev = last.get(c.client_id);
    const at = c.last_synced_at ?? "";
    if (prev === undefined || at < prev) last.set(c.client_id, at);
  }
  const queue = Array.from(ids).sort((a, b) => (last.get(a) ?? "").localeCompare(last.get(b) ?? ""));

  const results: { client: string; platform: SocialPlatform; ok: boolean; error?: string; linked: number }[] = [];
  const worker = async () => {
    while (queue.length && Date.now() - started < budgetMs) {
      const id = queue.shift()!;
      for (const r of await scanClient(admin, id)) results.push({ client: id, ...r });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return results;
}
