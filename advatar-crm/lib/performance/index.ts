import { inOrder, type ContentVideo, type VideoCycle } from "@/lib/videos";

/**
 * How each video did (0046): the link it was posted at on each
 * platform, the numbers it reached there, and the sums the
 * Performance tab and its reports are made from.
 *
 * Everything here is plain arithmetic on saved numbers, shared by the
 * screen and the report so the two can never disagree.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export type PlatformId = "instagram" | "tiktok" | "youtube" | "facebook" | "linkedin" | "x" | "other";

export const PLATFORMS: { id: PlatformId; label: string; rgb: string }[] = [
  { id: "instagram", label: "Instagram", rgb: "225, 48, 108" },
  { id: "tiktok", label: "TikTok", rgb: "20, 184, 166" },
  { id: "youtube", label: "YouTube", rgb: "239, 68, 68" },
  { id: "facebook", label: "Facebook", rgb: "59, 130, 246" },
  { id: "linkedin", label: "LinkedIn", rgb: "14, 116, 190" },
  { id: "x", label: "X", rgb: "113, 113, 122" },
  { id: "other", label: "Other", rgb: "139, 92, 246" },
];

export const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? "Other";

export const METRICS = ["views", "likes", "comments", "shares", "saves"] as const;
export type Metric = (typeof METRICS)[number];
export const METRIC_LABEL: Record<Metric, string> = { views: "Views", likes: "Likes", comments: "Comments", shares: "Shares", saves: "Saves" };

export type Numbers = Record<Metric, number | null>;

export interface VideoPost extends Numbers {
  id: string;
  video_id: string;
  client_id: string;
  platform: PlatformId;
  url: string;
  metrics_at: string | null;
  metrics_source: "typed" | "screenshot" | "youtube" | null;
}

export const POST_COLUMNS = "id, video_id, client_id, platform, url, views, likes, comments, shares, saves, metrics_at, metrics_source";

export function detectPlatform(url: string): PlatformId {
  let host = "";
  try {
    host = new URL(url.trim()).hostname.replace(/^www\.|^m\.|^vm\.|^vt\./, "");
  } catch {
    return "other";
  }
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)facebook\.com$|^fb\.watch$/.test(host)) return "facebook";
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin";
  if (/^(x|twitter)\.com$/.test(host)) return "x";
  return "other";
}

export const hasNumbers = (p: Numbers) => METRICS.some((m) => p[m] !== null && p[m] !== undefined);

/** 12400 -> "12.4K". Exact under 10,000, where every digit is still readable. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  if (n < 10_000) return n.toLocaleString("en-GB");
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1).replace(/\.?0+$/, "")}M`;
}

export const percent = (rate: number | null) => (rate === null ? "–" : `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`);

/** One video as the Performance tab sees it. */
export interface PerfVideo {
  id: string;
  /** "Month 1 · Video 3", or "Video" outside a month. */
  name: string;
  title: string | null;
  pillar: string | null;
  type: string | null;
  /** The day it went out: when it was ticked as posted, else its date. */
  date: string | null;
  posted: boolean;
  posts: VideoPost[];
}

export interface Totals {
  videos: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  /** Likes, comments, shares and saves together. */
  engagements: number;
  /** Engagements for every view. Null with no views to divide by. */
  rate: number | null;
}

export interface Group extends Totals {
  name: string;
  avgViews: number;
}

export interface RankedVideo extends Totals {
  id: string;
  name: string;
  title: string | null;
  pillar: string | null;
  type: string | null;
  date: string | null;
  platforms: string[];
}

export interface Summary {
  totals: Totals;
  byPlatform: Group[];
  byPillar: Group[];
  byType: Group[];
  byMonth: Group[];
  /** Every video with numbers, most viewed first. */
  ranked: RankedVideo[];
  /** Posted, but no link was ever added. */
  missingLinks: { id: string; name: string; title: string | null }[];
  /** A link with no numbers against it yet. */
  missingNumbers: { post: VideoPost; name: string; title: string | null }[];
  /** How many videos were in the range at all. */
  inRange: number;
}

function add(into: Totals, n: Numbers) {
  for (const m of METRICS) into[m] += n[m] ?? 0;
}

function finish<T extends Totals>(t: T): T {
  t.engagements = t.likes + t.comments + t.shares + t.saves;
  t.rate = t.views > 0 ? t.engagements / t.views : null;
  return t;
}

const blank = (): Totals => ({ videos: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagements: 0, rate: null });

export function videoInRange(v: PerfVideo, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!v.date) return false;
  return (!from || v.date >= from) && (!to || v.date <= to);
}

export function summarise(all: PerfVideo[], from: string | null = null, to: string | null = null): Summary {
  const videos = all.filter((v) => (v.posted || v.posts.length > 0) && videoInRange(v, from, to));
  const totals = blank();
  const platform = new Map<string, Group>();
  const pillar = new Map<string, Group>();
  const type = new Map<string, Group>();
  const month = new Map<string, Group>();
  const ranked: RankedVideo[] = [];
  const missingLinks: Summary["missingLinks"] = [];
  const missingNumbers: Summary["missingNumbers"] = [];

  const group = (map: Map<string, Group>, name: string) => {
    if (!map.has(name)) map.set(name, { ...blank(), name, avgViews: 0 });
    return map.get(name)!;
  };

  for (const v of videos) {
    if (v.posts.length === 0) {
      missingLinks.push({ id: v.id, name: v.name, title: v.title });
      continue;
    }
    const counted = v.posts.filter(hasNumbers);
    for (const p of v.posts) if (!hasNumbers(p)) missingNumbers.push({ post: p, name: v.name, title: v.title });
    if (counted.length === 0) continue;

    const own: RankedVideo = {
      ...blank(),
      videos: 1,
      id: v.id,
      name: v.name,
      title: v.title,
      pillar: v.pillar,
      type: v.type,
      date: v.date,
      platforms: counted.map((p) => p.platform),
    };
    for (const p of counted) {
      add(own, p);
      const g = group(platform, p.platform);
      g.videos++;
      add(g, p);
    }
    finish(own);
    ranked.push(own);

    totals.videos++;
    add(totals, own);
    for (const [map, name] of [
      [pillar, v.pillar?.trim() || "No pillar"],
      [type, v.type?.trim() || ""],
      [month, v.date ? v.date.slice(0, 7) : ""],
    ] as [Map<string, Group>, string][]) {
      if (!name) continue;
      const g = group(map, name);
      g.videos++;
      add(g, own);
    }
  }

  const done = (map: Map<string, Group>) =>
    Array.from(map.values()).map((g) => {
      finish(g);
      g.avgViews = g.videos ? Math.round(g.views / g.videos) : 0;
      return g;
    });

  return {
    totals: finish(totals),
    byPlatform: done(platform).sort((a, b) => b.views - a.views),
    byPillar: done(pillar).sort((a, b) => b.avgViews - a.avgViews),
    byType: done(type).sort((a, b) => b.avgViews - a.avgViews),
    byMonth: done(month).sort((a, b) => a.name.localeCompare(b.name)),
    ranked: ranked.sort((a, b) => b.views - a.views || b.engagements - a.engagements),
    missingLinks,
    missingNumbers,
    inRange: videos.length,
  };
}

export function monthName(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Every video of one client with its posts. Never throws: before 0046
 * there are no posts, and `available` says so.
 */
export async function loadPerformance(
  supabase: QueryableClient,
  clientId: string
): Promise<{ videos: PerfVideo[]; cycles: VideoCycle[]; available: boolean }> {
  const [vids, place, cyc, posts] = await Promise.all([
    supabase.from("content_videos").select("id, publish_on, day_order, title, pillar, video_type, posted_at").eq("client_id", clientId),
    supabase.from("content_videos").select("id, cycle_id, position").eq("client_id", clientId),
    supabase.from("content_cycles").select("id, client_id, number, starts_on, ends_on").eq("client_id", clientId).order("number"),
    supabase.from("video_posts").select(POST_COLUMNS).eq("client_id", clientId),
  ]);
  if (posts.error) return { videos: [], cycles: [], available: false };

  const cycles = (cyc.error ? [] : cyc.data ?? []) as VideoCycle[];
  const placeById = new Map(
    ((place.error ? [] : place.data ?? []) as { id: string; cycle_id: string | null; position: number | null }[]).map((p) => [p.id, p])
  );
  type Row = Pick<ContentVideo, "id" | "publish_on" | "day_order" | "title" | "pillar" | "video_type" | "posted_at">;
  const rows = ((vids.data ?? []) as Row[]).map((v) => ({ ...v, cycle_id: placeById.get(v.id)?.cycle_id ?? null, position: placeById.get(v.id)?.position ?? null }));

  const name = new Map<string, string>();
  for (const c of cycles) inOrder(rows.filter((v) => v.cycle_id === c.id)).forEach((v, i) => name.set(v.id, `Month ${c.number} · Video ${i + 1}`));

  const postsByVideo = new Map<string, VideoPost[]>();
  for (const p of (posts.data ?? []) as VideoPost[]) {
    if (!postsByVideo.has(p.video_id)) postsByVideo.set(p.video_id, []);
    postsByVideo.get(p.video_id)!.push(p);
  }

  const videos = inOrder(rows)
    .map<PerfVideo>((v) => ({
      id: v.id,
      name: name.get(v.id) ?? "Video",
      title: v.title?.trim() || null,
      pillar: v.pillar?.trim() || null,
      type: v.video_type?.trim() || null,
      date: v.posted_at ? v.posted_at.slice(0, 10) : v.publish_on,
      posted: Boolean(v.posted_at),
      posts: postsByVideo.get(v.id) ?? [],
    }))
    .sort((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9"));

  return { videos, cycles, available: true };
}
