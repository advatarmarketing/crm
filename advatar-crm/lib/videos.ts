import { postingDates, type PackageSettings } from "@/lib/packages";

/**
 * The video schedule (0042): one row per video going out.
 *
 * Shared by the team's Videos tab, both calendars, the dashboards and
 * the client's Videos page, so "what is this video's state" has one
 * answer everywhere.
 */

// Structural, for the same reason as lib/uploads.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export interface ContentVideo {
  id: string;
  client_id: string;
  publish_on: string | null;
  day_order: number;
  title: string | null;
  pillar: string | null;
  video_type: string | null;
  description: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
  wms: string | null;
  scenery: string | null;
  video_set: string | null;
  submission_id: string | null;
  posted_at: string | null;
  /** 0045: the month it belongs to, and its place in it. */
  cycle_id?: string | null;
  position?: number | null;
}

/** 0045: "Month 1", "Month 2"... each with its own dates. */
export interface VideoCycle {
  id: string;
  client_id: string;
  number: number;
  starts_on: string;
  ends_on: string;
}

/** The upload a video is delivered through, as much as the schedule needs. */
export interface LinkedUpload {
  id: string;
  title: string;
  status: string;
  visibility: string;
  current_version: number;
  client_decision: string | null;
  kind: string;
}

export type VideoStage =
  | "planned" // nothing uploaded yet
  | "editing" // uploaded, the team has not shared it yet
  | "ready" // shared with the client, waiting on them (or nothing to wait on)
  | "changes" // the client asked for changes
  | "approved" // the client approved it
  | "posted"; // gone out

export const VIDEO_COLUMNS =
  "id, client_id, publish_on, day_order, title, pillar, video_type, description, hook, body, cta, wms, scenery, video_set, submission_id, posted_at";

export const STAGE_LABEL: Record<VideoStage, { team: string; client: string; tone: "neutral" | "info" | "warn" | "ok" | "accent" }> = {
  planned: { team: "Not uploaded", client: "In production", tone: "neutral" },
  editing: { team: "Uploaded, not shared", client: "In production", tone: "info" },
  ready: { team: "With the client", client: "Ready to watch", tone: "accent" },
  changes: { team: "Changes asked for", client: "Changes in progress", tone: "warn" },
  approved: { team: "Approved", client: "Approved", tone: "ok" },
  posted: { team: "Posted", client: "Posted", tone: "ok" },
};

export function videoStage(video: Pick<ContentVideo, "posted_at" | "submission_id">, upload: LinkedUpload | null | undefined): VideoStage {
  if (video.posted_at) return "posted";
  if (!video.submission_id || !upload || upload.current_version < 1) return "planned";
  if (upload.visibility !== "team_and_client") return "editing";
  if (upload.client_decision === "approved") return "approved";
  if (upload.client_decision === "changes_requested") return "changes";
  return "ready";
}

/** "Video going out" when nobody has given it a name yet. */
export function videoLabel(v: Pick<ContentVideo, "title" | "pillar">): string {
  return v.title?.trim() || (v.pillar?.trim() ? `${v.pillar.trim()} video` : "Video going out");
}

/** Today as YYYY-MM-DD in the server's or browser's own calendar. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function prettyDay(key: string, withWeekday = true): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: withWeekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Loads videos (and the uploads they link to) between two dates,
 * inclusive. RLS decides which clients come back. Never throws: before
 * 0042 runs the table does not exist, and every caller treats that as
 * "no schedule yet" rather than a broken page.
 */
export async function loadVideos(
  supabase: QueryableClient,
  opts: { clientId?: string; from?: string; to?: string; undated?: boolean } = {}
): Promise<{ videos: ContentVideo[]; uploads: Map<string, LinkedUpload>; available: boolean }> {
  let q = supabase.from("content_videos").select(VIDEO_COLUMNS);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (!opts.undated) {
    if (opts.from) q = q.gte("publish_on", opts.from);
    if (opts.to) q = q.lte("publish_on", opts.to);
  }
  q = q.order("publish_on", { ascending: true, nullsFirst: false }).order("day_order", { ascending: true });

  const { data, error } = await q;
  if (error) return { videos: [], uploads: new Map(), available: false };

  let videos = (data ?? []) as ContentVideo[];
  if (opts.undated) {
    videos = videos.filter(
      (v) => v.publish_on === null || ((!opts.from || v.publish_on >= opts.from) && (!opts.to || v.publish_on <= opts.to))
    );
  }

  const ids = Array.from(new Set(videos.map((v) => v.submission_id).filter((x): x is string => Boolean(x))));
  const uploads = new Map<string, LinkedUpload>();
  if (ids.length > 0) {
    // Its own query: client_decision and kind come from 0042, and a
    // failure here costs the stage labels, not the schedule.
    const { data: subs } = await supabase
      .from("submissions")
      .select("id, title, status, visibility, current_version, client_decision, kind")
      .in("id", ids);
    for (const s of (subs ?? []) as LinkedUpload[]) uploads.set(s.id, s);
  }

  return { videos, uploads, available: true };
}

/**
 * Pillars spread across a month in proportion to their share of the
 * plan, interleaved so the same pillar does not land three days running.
 * Pillars with no percentage share what is left equally.
 */
export function pillarSequence(pillars: { name: string; pct: number }[], count: number): (string | null)[] {
  const named = pillars.filter((p) => p.name.trim());
  if (named.length === 0 || count === 0) return Array(count).fill(null);

  const given = named.reduce((n, p) => n + Math.max(0, p.pct || 0), 0);
  const unweighted = named.filter((p) => !(p.pct > 0)).length;
  const leftover = Math.max(0, 100 - given);
  const weights = named.map((p) => (p.pct > 0 ? p.pct : unweighted ? leftover / unweighted || 1 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || named.length;

  // Largest-remainder split, then a smooth weighted round-robin.
  const exact = weights.map((w) => (w / total) * count);
  const counts = exact.map(Math.floor);
  let rest = count - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; rest > 0; k++, rest--) counts[order[k % order.length].i]++;

  const out: string[] = [];
  const credit = counts.map(() => 0);
  const left = [...counts];
  for (let n = 0; n < count; n++) {
    let best = -1;
    for (let i = 0; i < named.length; i++) {
      if (left[i] === 0) continue;
      credit[i] += counts[i];
      if (best === -1 || credit[i] > credit[best]) best = i;
    }
    credit[best] -= count;
    left[best]--;
    out.push(named[best].name.trim());
  }
  return out;
}

/**
 * The videos a package implies between two dates that are not already
 * on the schedule. A day that already has one video and should have
 * two gets one more; a day that already has enough gets none. Nothing
 * is ever removed — moving and deleting are deliberate acts.
 */
export function videosToAdd(
  pkg: PackageSettings,
  from: string,
  to: string,
  existing: { publish_on: string | null }[]
): { date: string; day_order: number }[] {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (!(days > 0)) return [];
  const have = new Map<string, number>();
  for (const v of existing) if (v.publish_on) have.set(v.publish_on, (have.get(v.publish_on) ?? 0) + 1);

  const out: { date: string; day_order: number }[] = [];
  for (const { date, count } of postingDates(pkg, from, days)) {
    const already = have.get(date) ?? 0;
    for (let n = already; n < count; n++) out.push({ date, day_order: n + 1 });
  }
  return out;
}

/** First and last day of the month containing `key`. */
export function monthBounds(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}

/**
 * The five colours on the team's Videos tab. One answer per video:
 *   todo      (red)    nothing made yet
 *   scripted  (yellow) a script is written, no video yet
 *   revisions (purple) changes asked for, or fixes still unticked
 *   done      (orange) the video is in, not posted yet
 *   posted    (green)  gone out
 */
export type BoxState = "todo" | "scripted" | "revisions" | "done" | "posted";

export const BOX_STATES: BoxState[] = ["todo", "scripted", "done", "revisions", "posted"];

export const BOX_LABEL: Record<BoxState, string> = {
  todo: "Not done yet",
  scripted: "Scripted",
  done: "Done, not posted",
  revisions: "Needs revisions",
  posted: "Posted",
};

export function boxState(
  video: Pick<ContentVideo, "posted_at" | "submission_id" | "hook" | "body">,
  upload: { current_version: number; clientDecision?: string | null; client_decision?: string | null } | null | undefined,
  openFixes = 0
): BoxState {
  if (video.posted_at) return "posted";
  if (video.submission_id && upload && upload.current_version >= 1) {
    const decision = upload.clientDecision ?? upload.client_decision ?? null;
    return decision === "changes_requested" || openFixes > 0 ? "revisions" : "done";
  }
  return video.hook?.trim() || video.body?.trim() ? "scripted" : "todo";
}

/** A month from `start`: 16 Nov -> 15 Dec. */
export function defaultCycleEnd(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return addDays(next.toISOString().slice(0, 10), -1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** How many videos the package gives between two dates. */
export function packageCount(pkg: PackageSettings | null, from: string, to: string): number {
  const days = daysBetween(from, to);
  if (!pkg || !(days > 0)) return 0;
  return postingDates(pkg, from, days).reduce((n, d) => n + d.count, 0);
}

/**
 * Dates for `count` videos between two days. The package's posting
 * days are used first, in order. With no package, or more videos than
 * posting days, the rest are spread evenly across the month.
 */
export function cycleDates(pkg: PackageSettings | null, from: string, to: string, count: number): { date: string; day_order: number }[] {
  const days = daysBetween(from, to);
  if (!(days > 0) || count <= 0) return [];
  const slots: string[] = [];
  if (pkg) for (const d of postingDates(pkg, from, days)) for (let i = 0; i < d.count; i++) slots.push(d.date);

  const dates = slots.slice(0, count);
  const extra = count - dates.length;
  for (let i = 0; i < extra; i++) dates.push(addDays(from, Math.min(days - 1, Math.floor((i * days) / extra))));
  dates.sort();

  const seen = new Map<string, number>();
  return dates.map((date) => {
    const n = (seen.get(date) ?? 0) + 1;
    seen.set(date, n);
    return { date, day_order: Math.min(9, n) };
  });
}

/** Videos of one month in their numbered order. */
export function inOrder<T extends Pick<ContentVideo, "position" | "publish_on" | "day_order">>(videos: T[]): T[] {
  return [...videos].sort(
    (a, b) =>
      (a.position ?? 99999) - (b.position ?? 99999) ||
      (a.publish_on ?? "9").localeCompare(b.publish_on ?? "9") ||
      a.day_order - b.day_order
  );
}
