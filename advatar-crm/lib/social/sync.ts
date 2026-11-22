import "server-only";
import { isShortLink, postKey, socialKeys, type MatchPlatform } from "./match";
import { youtubeId, youtubeNumbers, youtubeOn } from "@/lib/performance/youtube";

// The service-role client (lib/supabase/admin.ts) is untyped on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

/** Today in London, as the snapshot's day — the agency's day, not UTC's. */
export function londonDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
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
