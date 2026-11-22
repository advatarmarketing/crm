import "server-only";
import { londonDay } from "./sync";
import { SOCIAL_PLATFORMS, isSocialPlatform, type Range, type SocialConnection, type SocialPlatform, type SocialPost, type SocialUrls } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Everything the Content Hub draws, worked out from the scraper's dated
 * readings (social_readings, 0052). Only readings marked "ok" count: a
 * failed or flagged reading never reaches the client, so the last good
 * number keeps showing until staff accept the new one or a good one
 * comes in.
 *
 * Read with the viewer's own session: RLS lets a client read only their
 * own good readings, and the team the clients they're on.
 */

export interface Baseline {
  followers: number | null;
  started_on: string;
}

export interface PlatformResult {
  platform: SocialPlatform;
  /** The profile link the team entered. */
  url: string | null;
  /** A good reading exists for this link. */
  read: boolean;
  connection: SocialConnection | null;
  handle: string | null;
  followers: number | null;
  /** Change over the period, or null until there are two readings to compare. */
  growth: number | null;
  /** When growth is measured from a later day than the period start. */
  growthSince: string | null;
  series: { day: string; followers: number }[];
  /** Null: the platform didn't show it for any post in the period. */
  likes: number | null;
  comments: number | null;
  /** Posts published in the period: total now minus total at the start. Null if unknown. */
  posts: number | null;
  /** Posts can't be counted yet: only one reading so far. */
  postsPending: boolean;
  baseline: Baseline | null;
  lastReadAt: string | null;
}

export interface Dashboard {
  ready: boolean;
  problem: string | null;
  chosen: SocialPlatform[];
  platforms: PlatformResult[];
  connectedCount: number;
  totals: { followers: number | null; growth: number | null; likes: number | null; comments: number | null; posts: number | null; postsPending: boolean; avgComments: number | null };
  mostCommented: SocialPost | null;
  recent: SocialPost[];
  topVideos: SocialPost[];
  lastUpdated: string | null;
  from: string;
  /** The earliest starting date across platforms; nothing before it counts. */
  startedOn: string | null;
  urls: SocialUrls;
  baselines: Partial<Record<SocialPlatform, Baseline>>;
  rangeLabel: string;
}

interface Reading {
  platform: SocialPlatform;
  url: string;
  taken_at: string;
  followers: number | null;
  posts_count: number | null;
}

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const dayOf = (iso: string) => londonDay(new Date(iso));
const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The public address of a kept post picture. */
function thumbUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return path && base ? `${base}/storage/v1/object/public/social-thumbs/${path.split("/").map(encodeURIComponent).join("/")}` : null;
}

/** Same account? Links are compared tidied, so "www." or a trailing slash don't matter. */
function sameLink(a: string, b: string): boolean {
  const t = (x: string) => x.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  return t(a) === t(b);
}

export async function loadDashboard(supabase: Db, clientId: string, range: Range): Promise<Dashboard> {
  const today = londonDay();

  const [{ data: client, error: clientError }, { data: baseRows }] = await Promise.all([
    supabase.from("clients").select("social_platforms, social_urls, posting_started_on").eq("id", clientId).maybeSingle(),
    supabase.from("social_baselines").select("platform, followers, started_on").eq("client_id", clientId),
  ]);
  const urls: SocialUrls = (client?.social_urls ?? {}) as SocialUrls;
  const baselines: Partial<Record<SocialPlatform, Baseline>> = {};
  for (const b of (baseRows ?? []) as { platform: string; followers: number | null; started_on: string }[]) {
    if (isSocialPlatform(b.platform)) baselines[b.platform] = { followers: b.followers == null ? null : Number(b.followers), started_on: b.started_on };
  }
  const starts = Object.values(baselines).map((b) => b!.started_on).sort();
  const startedOn: string | null = starts[0] ?? client?.posting_started_on ?? null;

  // Only our work counts: a period never reaches back before we started.
  const asked = range === "since" ? startedOn ?? shiftDay(today, -30) : shiftDay(today, -range);
  const from = startedOn && startedOn > asked ? startedOn : asked;
  const rangeLabel = from !== asked || range === "since" ? `since ${pretty(from)}` : `the last ${range} days`;

  const chosenRaw = ((client?.social_platforms ?? []) as string[]).filter(isSocialPlatform);
  const linked = SOCIAL_PLATFORMS.map((p) => p.id).filter((p) => urls[p]);
  // A profile link means we post there.
  const ordered = SOCIAL_PLATFORMS.map((p) => p.id).filter((p) => chosenRaw.includes(p) || linked.includes(p));

  const empty: Dashboard = {
    ready: false,
    problem: null,
    chosen: ordered,
    platforms: [],
    connectedCount: 0,
    totals: { followers: null, growth: null, likes: null, comments: null, posts: null, postsPending: false, avgComments: null },
    mostCommented: null,
    recent: [],
    topVideos: [],
    lastUpdated: null,
    from,
    startedOn,
    urls,
    baselines,
    rangeLabel,
  };
  if (clientError) return { ...empty, problem: /social_|column/.test(clientError.message) ? null : clientError.message };

  const startIso = `${startedOn ?? "1970-01-01"}T00:00:00Z`;
  const [conns, reads, inRange, latest] = await Promise.all([
    supabase
      .from("social_connections")
      .select("client_id, platform, account_name, account_handle, avatar_url, status, connected_at, last_synced_at, last_error")
      .eq("client_id", clientId),
    supabase
      .from("social_readings")
      .select("platform, url, taken_at, followers, posts_count")
      .eq("client_id", clientId)
      .eq("kind", "profile")
      .eq("status", "ok")
      .order("taken_at", { ascending: true })
      .limit(5000),
    supabase
      .from("social_posts")
      .select("id, platform, external_id, posted_at, caption, thumbnail_url, thumbnail_path, permalink, is_video, likes, comments, views, shares")
      .eq("client_id", clientId)
      .gte("posted_at", `${from}T00:00:00Z`)
      .order("posted_at", { ascending: false })
      .limit(500),
    supabase
      .from("social_posts")
      .select("id, platform, external_id, posted_at, caption, thumbnail_url, thumbnail_path, permalink, is_video, likes, comments, views, shares")
      .eq("client_id", clientId)
      .gte("posted_at", startIso)
      .order("posted_at", { ascending: false })
      .limit(60),
  ]);

  const problem = reads.error?.message ?? conns.error?.message ?? null;
  if (problem) return { ...empty, problem: /social_readings|does not exist/.test(problem) ? null : problem };

  const fix = (p: SocialPost & { thumbnail_path?: string | null }): SocialPost => ({ ...p, thumbnail_url: thumbUrl(p.thumbnail_path) ?? p.thumbnail_url });
  const connections = (conns.data ?? []) as SocialConnection[];
  const readings = (reads.data ?? []) as Reading[];
  const posts = ((inRange.data ?? []) as SocialPost[]).filter((p) => ordered.includes(p.platform)).map(fix);
  const recentAll = ((latest.data ?? []) as SocialPost[]).filter((p) => ordered.includes(p.platform)).map(fix);

  const platforms: PlatformResult[] = ordered.map((platform) => {
    const url = urls[platform] ?? null;
    const connection = connections.find((c) => c.platform === platform) ?? null;
    // Readings of the account the link points to now (a changed link
    // starts afresh rather than mixing two accounts).
    const mine = url ? readings.filter((r) => r.platform === platform && sameLink(r.url, url)) : [];
    const withFollowers = mine.filter((r) => r.followers != null);
    const last = withFollowers[withFollowers.length - 1] ?? null;
    const baseline = baselines[platform] ?? null;

    let growth: number | null = null;
    let growthSince: string | null = null;
    let startReading: Reading | null = null;
    if (last) {
      if (range === "since" && baseline?.followers != null) {
        growth = (last.followers ?? 0) - baseline.followers;
      } else {
        // The reading on the start day (or the last one before it); if
        // tracking began inside the period, from the first reading.
        const before = [...withFollowers].reverse().find((r) => dayOf(r.taken_at) <= from);
        startReading = before ?? withFollowers.find((r) => dayOf(r.taken_at) >= from) ?? null;
        if (startReading && startReading !== last) {
          growth = (last.followers ?? 0) - (startReading.followers ?? 0);
          if (dayOf(startReading.taken_at) > from) growthSince = dayOf(startReading.taken_at);
        }
      }
    }

    // One point a day (the day's last reading) for the little chart.
    const byDay = new Map<string, number>();
    for (const r of withFollowers) if (dayOf(r.taken_at) >= from) byDay.set(dayOf(r.taken_at), r.followers as number);
    const series = Array.from(byDay, ([day, followers]) => ({ day, followers }));

    // Posts published: total now minus total at the start.
    const withCount = mine.filter((r) => r.posts_count != null);
    const lastCount = withCount[withCount.length - 1] ?? null;
    const startCount = [...withCount].reverse().find((r) => dayOf(r.taken_at) <= from) ?? withCount.find((r) => dayOf(r.taken_at) >= from) ?? null;
    const postsPublished = lastCount && startCount && lastCount !== startCount ? Math.max(0, (lastCount.posts_count ?? 0) - (startCount.posts_count ?? 0)) : null;

    // No posts in the period: nothing to add up, so 0. Posts, but none
    // showing the number (hidden likes, login walls): not available.
    const p = posts.filter((x) => x.platform === platform);
    const sum = (k: "likes" | "comments") => (p.length === 0 ? 0 : p.some((x) => x[k] != null) ? p.reduce((n, x) => n + (x[k] ?? 0), 0) : null);

    return {
      platform,
      url,
      read: !!last,
      connection,
      handle: connection?.account_handle ?? null,
      followers: last?.followers ?? null,
      growth,
      growthSince,
      series,
      likes: sum("likes"),
      comments: sum("comments"),
      posts: postsPublished,
      postsPending: postsPublished == null && withCount.length > 0,
      baseline,
      lastReadAt: mine.length ? mine[mine.length - 1].taken_at : null,
    };
  });

  const live = platforms.filter((p) => p.read);
  const sumOrNull = (vals: (number | null)[]) => (vals.some((v) => v != null) ? vals.reduce<number>((n, v) => n + (v ?? 0), 0) : null);
  const likes = sumOrNull(live.map((p) => p.likes));
  const comments = sumOrNull(live.map((p) => p.comments));
  const postCount = sumOrNull(live.map((p) => p.posts));
  const readPosts = posts.filter((p) => live.some((l) => l.platform === p.platform) && p.comments != null).length;
  const commented = posts.filter((p) => (p.comments ?? 0) > 0).sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0));
  const lastUpdated = live.map((p) => p.lastReadAt).filter((v): v is string => !!v).sort().pop() ?? null;

  return {
    ready: true,
    problem: null,
    chosen: ordered,
    platforms,
    connectedCount: live.length,
    totals: {
      followers: sumOrNull(live.map((p) => p.followers)),
      growth: sumOrNull(live.map((p) => p.growth)),
      likes,
      comments,
      posts: postCount,
      postsPending: postCount == null && live.some((p) => p.postsPending),
      avgComments: comments != null && readPosts ? comments / readPosts : null,
    },
    mostCommented: commented[0] ?? null,
    recent: recentAll.slice(0, 24),
    topVideos: posts
      .filter((p) => p.is_video && p.views != null)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 6),
    lastUpdated,
    from,
    startedOn,
    urls,
    baselines,
    rangeLabel,
  };
}
