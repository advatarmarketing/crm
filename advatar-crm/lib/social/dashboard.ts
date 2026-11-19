import "server-only";
import { configuredFor } from "./config";
import { londonDay } from "./sync";
import {
  SOCIAL_PLATFORMS,
  isSocialPlatform,
  type RangeDays,
  type SocialConnection,
  type SocialPlatform,
  type SocialPost,
  type SocialSnapshot,
} from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface PlatformResult {
  platform: SocialPlatform;
  /** The server has the platform's app keys (META_* / TIKTOK_*). */
  available: boolean;
  connection: SocialConnection | null;
  followers: number | null;
  /** Change over the period, or null until there are two days to compare. */
  growth: number | null;
  growthSince: string | null;
  series: { day: string; followers: number }[];
  likes: number;
  comments: number;
  posts: number;
}

export interface Dashboard {
  ready: boolean;
  problem: string | null;
  chosen: SocialPlatform[];
  platforms: PlatformResult[];
  connectedCount: number;
  totals: { followers: number | null; growth: number | null; likes: number; comments: number; posts: number; avgComments: number | null };
  mostCommented: SocialPost | null;
  recent: SocialPost[];
  topVideos: SocialPost[];
  lastUpdated: string | null;
  from: string;
}

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

/**
 * Everything the Content Hub draws, for one client and one period.
 * Read with the viewer's own session: RLS (0048) lets a client read
 * their own rows and the team read the clients they're on.
 */
export async function loadDashboard(supabase: Db, clientId: string, days: RangeDays): Promise<Dashboard> {
  const today = londonDay();
  const from = shiftDay(today, -days);
  const fromIso = `${from}T00:00:00Z`;

  const empty: Dashboard = {
    ready: false,
    problem: null,
    chosen: [],
    platforms: [],
    connectedCount: 0,
    totals: { followers: null, growth: null, likes: 0, comments: 0, posts: 0, avgComments: null },
    mostCommented: null,
    recent: [],
    topVideos: [],
    lastUpdated: null,
    from,
  };

  const { data: client, error: clientError } = await supabase.from("clients").select("social_platforms").eq("id", clientId).maybeSingle();
  if (clientError) {
    return { ...empty, problem: /social_platforms/.test(clientError.message) ? null : clientError.message };
  }
  const chosen = ((client?.social_platforms ?? []) as string[]).filter(isSocialPlatform);
  const ordered = SOCIAL_PLATFORMS.map((p) => p.id).filter((p) => chosen.includes(p));

  const [conns, snaps, inRange, latest] = await Promise.all([
    supabase
      .from("social_connections")
      .select("client_id, platform, account_name, account_handle, avatar_url, status, connected_at, last_synced_at, last_error")
      .eq("client_id", clientId),
    supabase
      .from("social_snapshots")
      .select("platform, day, followers, posts_count")
      .eq("client_id", clientId)
      .gte("day", shiftDay(from, -14))
      .order("day"),
    supabase
      .from("social_posts")
      .select("id, platform, external_id, posted_at, caption, thumbnail_url, permalink, is_video, likes, comments, views, shares")
      .eq("client_id", clientId)
      .gte("posted_at", fromIso)
      .order("posted_at", { ascending: false })
      .limit(500),
    supabase
      .from("social_posts")
      .select("id, platform, external_id, posted_at, caption, thumbnail_url, permalink, is_video, likes, comments, views, shares")
      .eq("client_id", clientId)
      .order("posted_at", { ascending: false })
      .limit(60),
  ]);

  const problem = conns.error?.message ?? snaps.error?.message ?? null;
  if (problem) return { ...empty, chosen: ordered, problem: /social_/.test(problem) ? null : problem };

  const connections = (conns.data ?? []) as SocialConnection[];
  const snapshots = (snaps.data ?? []) as SocialSnapshot[];
  const posts = ((inRange.data ?? []) as SocialPost[]).filter((p) => ordered.includes(p.platform));
  const recentAll = ((latest.data ?? []) as SocialPost[]).filter((p) => ordered.includes(p.platform));

  const platforms: PlatformResult[] = ordered.map((platform) => {
    const connection = connections.find((c) => c.platform === platform) ?? null;
    const mine = snapshots.filter((s) => s.platform === platform && s.followers != null);
    const latestSnap = mine[mine.length - 1] ?? null;
    // The day the period starts on, or the nearest day before it; if
    // tracking began inside the period, growth runs from that first day.
    const before = [...mine].reverse().find((s) => s.day <= from);
    const startSnap = before ?? mine.find((s) => s.day >= from) ?? null;
    const growth =
      latestSnap && startSnap && startSnap.day !== latestSnap.day ? (latestSnap.followers ?? 0) - (startSnap.followers ?? 0) : null;
    const series = mine.filter((s) => s.day >= (startSnap?.day ?? from)).map((s) => ({ day: s.day, followers: s.followers as number }));
    const p = posts.filter((x) => x.platform === platform);

    return {
      platform,
      available: configuredFor(platform),
      connection,
      followers: connection ? latestSnap?.followers ?? null : null,
      growth: connection ? growth : null,
      growthSince: startSnap && startSnap.day > from ? startSnap.day : null,
      series: connection ? series : [],
      likes: p.reduce((n, x) => n + (x.likes ?? 0), 0),
      comments: p.reduce((n, x) => n + (x.comments ?? 0), 0),
      posts: p.length,
    };
  });

  const live = platforms.filter((p) => p.connection);
  const sumOrNull = (vals: (number | null)[]) => (vals.some((v) => v != null) ? vals.reduce<number>((n, v) => n + (v ?? 0), 0) : null);
  const totalPosts = live.reduce((n, p) => n + p.posts, 0);
  const totalComments = live.reduce((n, p) => n + p.comments, 0);
  const commented = posts.filter((p) => (p.comments ?? 0) > 0).sort((a, b) => (b.comments ?? 0) - (a.comments ?? 0));
  const synced = connections
    .filter((c) => ordered.includes(c.platform))
    .map((c) => c.last_synced_at)
    .filter((v): v is string => !!v)
    .sort();

  return {
    ready: true,
    problem: null,
    chosen: ordered,
    platforms,
    connectedCount: live.length,
    totals: {
      followers: sumOrNull(live.map((p) => p.followers)),
      growth: sumOrNull(live.map((p) => p.growth)),
      likes: live.reduce((n, p) => n + p.likes, 0),
      comments: totalComments,
      posts: totalPosts,
      avgComments: totalPosts ? totalComments / totalPosts : null,
    },
    mostCommented: commented[0] ?? null,
    recent: recentAll.slice(0, 24),
    topVideos: posts
      .filter((p) => p.is_video && p.views != null)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 6),
    // The oldest of the accounts' last refreshes: honest about the
    // least fresh number on the page.
    lastUpdated: synced[0] ?? null,
    from,
  };
}
