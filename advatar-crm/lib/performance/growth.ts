import { postKey, socialKeys, type MatchPlatform } from "@/lib/social/match";
import { METRICS, type PerfVideo, type PlatformId, type VideoPost } from "./index";

/**
 * Followers over time and growth lines for the Performance tab and its
 * reports. Followers come from the scraper's daily profile readings
 * (social_readings, 0052) plus the starting count the team entered
 * (social_baselines); views, likes, comments and shares from each video's
 * latest numbers, counted on the day it went out.
 *
 * Everything below the loader is plain arithmetic, so the screen and the
 * saved report can never disagree. Nothing here throws before 0052 runs:
 * the loader just comes back empty.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export type PlatformFilter = "all" | PlatformId;

export interface FollowerPoint {
  platform: PlatformId;
  day: string;
  followers: number;
  /** The count the team entered for the day we started, not a reading. */
  baseline?: boolean;
}

export interface GrowthData {
  points: FollowerPoint[];
  /** Posts read from the profiles that no video's "Where it's posted" link points to. */
  extra: PerfVideo[];
  /** Platforms with a profile link. */
  linked: PlatformId[];
  /** Nothing before this counts: the day we started posting for them. */
  startedOn: string | null;
}

const SOCIAL: PlatformId[] = ["instagram", "tiktok", "youtube", "facebook", "linkedin", "x"];

export function londonDay(d: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof d === "string" ? new Date(d) : d);
}

function sameLink(a: string, b: string): boolean {
  const t = (x: string) => x.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  return t(a) === t(b);
}

export function platformName(id: string): string {
  return { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", linkedin: "LinkedIn", x: "X" }[id] ?? "Other";
}

export async function loadGrowth(supabase: QueryableClient, clientId: string, videos: PerfVideo[]): Promise<GrowthData> {
  const [client, base, reads, posts] = await Promise.all([
    supabase.from("clients").select("social_urls, posting_started_on").eq("id", clientId).maybeSingle(),
    supabase.from("social_baselines").select("platform, followers, started_on").eq("client_id", clientId),
    supabase
      .from("social_readings")
      .select("platform, url, taken_at, followers")
      .eq("client_id", clientId)
      .eq("kind", "profile")
      .eq("status", "ok")
      .not("followers", "is", null)
      .order("taken_at", { ascending: true })
      .limit(5000),
    supabase
      .from("social_posts")
      .select("id, platform, external_id, posted_at, caption, permalink, likes, comments, views, shares")
      .eq("client_id", clientId)
      .order("posted_at", { ascending: true })
      .limit(1000),
  ]);
  const urls = ((client.data?.social_urls ?? {}) as Record<string, string>) || {};
  const linked = SOCIAL.filter((p) => urls[p]);
  const baselines = ((base.error ? [] : base.data ?? []) as { platform: PlatformId; followers: number | null; started_on: string }[]).filter((b) => SOCIAL.includes(b.platform));
  const starts = baselines.map((b) => b.started_on).sort();
  const startedOn: string | null = starts[0] ?? client.data?.posting_started_on ?? null;

  // One point a day per platform (the day's last reading), only for the
  // account the link points to now.
  const byKey = new Map<string, FollowerPoint>();
  for (const r of (reads.error ? [] : reads.data ?? []) as { platform: PlatformId; url: string; taken_at: string; followers: number }[]) {
    if (!urls[r.platform] || !sameLink(r.url, urls[r.platform])) continue;
    const day = londonDay(r.taken_at);
    byKey.set(`${r.platform}|${day}`, { platform: r.platform, day, followers: Number(r.followers) });
  }
  for (const b of baselines) {
    if (b.followers == null || !urls[b.platform]) continue;
    const k = `${b.platform}|${b.started_on}`;
    if (!byKey.has(k)) byKey.set(k, { platform: b.platform, day: b.started_on, followers: Number(b.followers), baseline: true });
  }
  const points = Array.from(byKey.values()).sort((a, b) => a.day.localeCompare(b.day));

  // Posts read from the profile that aren't one of the planned videos'
  // links: counted too, so the numbers are the whole account's.
  const known = new Set<string>();
  for (const v of videos) for (const p of v.posts) if (p.platform !== "other") {
    const k = postKey(p.platform as MatchPlatform, p.url);
    if (k) known.add(k);
  }
  type Row = { id: string; platform: PlatformId; external_id: string; posted_at: string; caption: string | null; permalink: string | null; likes: number | null; comments: number | null; views: number | null; shares: number | null };
  const extra: PerfVideo[] = [];
  for (const r of (posts.error ? [] : posts.data ?? []) as Row[]) {
    if (!SOCIAL.includes(r.platform)) continue;
    if (socialKeys(r.platform as MatchPlatform, r.external_id, r.permalink).some((k) => known.has(k))) continue;
    const day = londonDay(r.posted_at);
    if (startedOn && day < startedOn) continue;
    if (r.likes == null && r.comments == null && r.views == null && r.shares == null) continue;
    const post: VideoPost = {
      id: `sp:${r.id}`,
      video_id: `sp:${r.id}`,
      client_id: clientId,
      platform: r.platform,
      url: r.permalink ?? "",
      views: r.views == null ? null : Number(r.views),
      likes: r.likes == null ? null : Number(r.likes),
      comments: r.comments == null ? null : Number(r.comments),
      shares: r.shares == null ? null : Number(r.shares),
      saves: null,
      metrics_at: null,
      metrics_source: "platform",
    };
    const caption = r.caption?.replace(/\s+/g, " ").trim() || null;
    extra.push({
      id: `sp:${r.id}`,
      name: `${platformName(r.platform)} post`,
      title: caption ? (caption.length > 90 ? `${caption.slice(0, 88)}…` : caption) : null,
      pillar: null,
      type: null,
      date: day,
      posted: true,
      posts: [post],
      link: r.permalink,
    });
  }
  return { points, extra, linked, startedOn };
}

/** Only one platform's posts (videos with none there drop out). */
export function filterPlatform(videos: PerfVideo[], platform: PlatformFilter): PerfVideo[] {
  if (platform === "all") return videos;
  return videos.map((v) => ({ ...v, posts: v.posts.filter((p) => p.platform === platform) })).filter((v) => v.posts.length > 0);
}

// ------------------------------------------------------------ followers from start to end

export interface FollowerSpanRow {
  platform: PlatformId;
  start: number;
  startDay: string;
  end: number;
  endDay: string;
  /** The first count we have is later than the start of the time chosen. */
  lateStart: boolean;
}

export interface FollowerSpan {
  rows: FollowerSpanRow[];
  /** All platforms together; null when none has a count in the time. */
  total: { start: number; end: number } | null;
}

/**
 * Followers at the start of the time chosen and at its end: the last
 * count on or before each day. If counting began inside the time, it
 * starts from the first count. A time still running ends today.
 */
export function followerSpan(points: FollowerPoint[], from: string | null, to: string | null, platform: PlatformFilter, today = londonDay()): FollowerSpan {
  const end = to && to < today ? to : today;
  const rows: FollowerSpanRow[] = [];
  const platforms = Array.from(new Set(points.map((p) => p.platform))).filter((p) => platform === "all" || p === platform);
  for (const p of SOCIAL.filter((x) => platforms.includes(x))) {
    const mine = points.filter((x) => x.platform === p && x.day <= end);
    if (!mine.length) continue;
    const last = mine[mine.length - 1];
    const before = from ? [...mine].reverse().find((x) => x.day <= from) : mine[0];
    const first = before ?? mine.find((x) => !from || x.day >= from)!;
    rows.push({ platform: p, start: first.followers, startDay: first.day, end: last.followers, endDay: last.day, lateStart: !!from && first.day > from });
  }
  return {
    rows,
    total: rows.length ? { start: rows.reduce((n, r) => n + r.start, 0), end: rows.reduce((n, r) => n + r.end, 0) } : null,
  };
}

// ------------------------------------------------------------ growth lines

export type GrowthMetric = "views" | "followers" | "likes" | "comments" | "shares";
export const GROWTH_METRICS: { id: GrowthMetric; label: string }[] = [
  { id: "views", label: "Views" },
  { id: "followers", label: "Followers" },
  { id: "likes", label: "Likes" },
  { id: "comments", label: "Comments" },
  { id: "shares", label: "Shares" },
];

export type Unit = "day" | "month";

export interface GrowthSeries {
  id: string;
  label: string;
  /** "r, g, b" for a platform; null for the all-together line. */
  rgb: string | null;
  values: (number | null)[];
}

export interface Growth {
  keys: string[];
  unit: Unit;
  series: GrowthSeries[];
  /** Nothing to draw. */
  empty: boolean;
}

const addDay = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const MAX_DAYS = 400;

/** The days (or months) from one date to another, inclusive. */
export function bucketKeys(from: string, to: string, unit: Unit): string[] {
  const out: string[] = [];
  if (unit === "month") {
    let [y, m] = from.slice(0, 7).split("-").map(Number);
    const [ty, tm] = to.slice(0, 7).split("-").map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
      if (out.length > 600) break;
    }
    return out;
  }
  for (let d = from; d <= to && out.length <= MAX_DAYS * 2; d = addDay(d, 1)) out.push(d);
  return out;
}

/** The dates the lines run between: the time chosen, or (all time) the first number we have to today. */
export function growthWindow(videos: PerfVideo[], points: FollowerPoint[], from: string | null, to: string | null, today = londonDay()): { from: string; to: string } | null {
  const end = to && to < today ? to : today;
  let start = from;
  if (!start) {
    const days = [...videos.map((v) => v.date).filter((d): d is string => !!d), ...points.map((p) => p.day)].sort();
    start = days[0] ?? null;
  }
  if (!start || start > end) return null;
  return { from: start, to: end };
}

/** Days when the time is short enough to read day by day, otherwise months. */
export function autoUnit(from: string, to: string): Unit {
  return bucketKeys(from, to, "day").length > 92 ? "month" : "day";
}

/**
 * One line per platform, plus all of them together when there is more
 * than one. Views, likes, comments and shares are each video's latest
 * numbers, put on the day (or month) it went out; with `running` they
 * add up from the start of the time. Followers are the count at the end
 * of each day or month (carried over from the last count), blank before
 * counting began.
 */
export function growthSeries(input: {
  videos: PerfVideo[];
  points: FollowerPoint[];
  from: string;
  to: string;
  unit: Unit;
  metric: GrowthMetric;
  platform: PlatformFilter;
  running: boolean;
  rgbOf: (p: PlatformId) => string | null;
}): Growth {
  const { videos, points, from, to, metric, platform, running, rgbOf } = input;
  const unit: Unit = input.unit === "day" && bucketKeys(from, to, "day").length > MAX_DAYS ? "month" : input.unit;
  const keys = bucketKeys(from, to, unit);
  const keyOf = (day: string) => (unit === "month" ? day.slice(0, 7) : day);
  const index = new Map(keys.map((k, i) => [k, i]));
  const series: GrowthSeries[] = [];

  if (metric === "followers") {
    const plats = SOCIAL.filter((p) => (platform === "all" || p === platform) && points.some((x) => x.platform === p));
    for (const p of plats) {
      const mine = points.filter((x) => x.platform === p);
      const values: (number | null)[] = keys.map((k) => {
        // The bucket's last day: the count then (carried over).
        const lastDay = unit === "month" ? `${k}-31` : k;
        const upTo = mine.filter((x) => x.day <= lastDay && x.day <= to);
        return upTo.length ? upTo[upTo.length - 1].followers : null;
      });
      series.push({ id: p, label: platformName(p), rgb: rgbOf(p), values });
    }
  } else {
    const m = metric as (typeof METRICS)[number];
    const per = new Map<PlatformId, number[]>();
    const has = new Set<PlatformId>();
    for (const v of videos) {
      if (!v.date) continue;
      const i = index.get(keyOf(v.date));
      if (i == null) continue;
      for (const p of v.posts) {
        if (platform !== "all" && p.platform !== platform) continue;
        const n = p[m];
        if (n == null) continue;
        if (!per.has(p.platform)) per.set(p.platform, keys.map(() => 0));
        per.get(p.platform)![i] += n;
        has.add(p.platform);
      }
    }
    for (const p of [...SOCIAL, "other" as PlatformId].filter((x) => has.has(x))) {
      let sum = 0;
      const values = per.get(p)!.map((n) => (running ? (sum += n) : n));
      series.push({ id: p, label: platformName(p), rgb: rgbOf(p), values });
    }
  }

  if (series.length > 1) {
    const values = keys.map((_, i) => {
      const vals = series.map((s) => s.values[i]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((n, v) => n + v, 0) : null;
    });
    series.unshift({ id: "all", label: "All together", rgb: null, values });
  }
  return { keys, unit, series, empty: series.length === 0 || series.every((s) => s.values.every((v) => v == null || (metric !== "followers" && v === 0))) };
}
