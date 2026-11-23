import { addDays, todayKey } from "@/lib/videos";

/**
 * When a video has to be ready (0053). Mirrors video_step_dates() in
 * the database, which sets the to-dos' due dates:
 *
 *   target  the Friday of the week before it goes out: the finished
 *           video should be sent by then
 *   latest  3 days before it goes out: the most we can ever slip
 *
 * A video counts as finished once it has been sent for approval (or
 * gone further than that).
 */

export type StepId = "film" | "edit" | "submit" | "post";

export const STEPS: { id: StepId; label: string; short: string }[] = [
  { id: "film", label: "Film", short: "Film" },
  { id: "edit", label: "Edit", short: "Edit" },
  { id: "submit", label: "Send for approval", short: "Send" },
  { id: "post", label: "Post", short: "Post" },
];

/** Monday of the week `key` is in (weeks run Monday to Sunday). */
export function mondayOf(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  return addDays(key, -dow);
}

export function targetDate(publish: string): string {
  return addDays(mondayOf(publish), -3);
}

export function latestDate(publish: string): string {
  return addDays(publish, -3);
}

export function stepDue(publish: string, step: StepId): string {
  const t = targetDate(publish);
  if (step === "film") return addDays(t, -4);
  if (step === "edit") return addDays(t, -1);
  if (step === "submit") return t;
  return publish;
}

export type Health = "ahead" | "on-target" | "behind" | "late";

export const HEALTH_LABEL: Record<Health, string> = {
  ahead: "Ahead",
  "on-target": "On target",
  behind: "Behind target",
  late: "Late",
};

/** Where one video stands against its dates today. */
export function videoHealth(publish: string, finished: boolean, today = todayKey()): Health | "done" {
  if (finished) return "done";
  if (today > latestDate(publish)) return "late";
  if (today > targetDate(publish)) return "behind";
  return addDays(today, 14) <= targetDate(publish) ? "ahead" : "on-target";
}

export interface Meter {
  /** Green, amber or red for the whole client. */
  health: Health;
  /** Whole weeks of finished videos still to go out. */
  weeksAhead: number;
  /** The last day every video up to is finished; null when nothing upcoming is. */
  finishedUntil: string | null;
  /** The next video that isn't finished, and its dates. */
  next: { publish: string; target: string; latest: string } | null;
  /** Upcoming videos not finished whose target has passed. */
  behindCount: number;
  /** Within 3 days of going out and not finished. */
  lateCount: number;
}

/**
 * The "weeks ahead" meter. `videos` are the client's dated videos that
 * haven't gone out yet (publish today or later), finished or not.
 */
export function meter(videos: { publish: string; finished: boolean }[], today = todayKey()): Meter {
  const upcoming = videos.filter((v) => v.publish >= today).sort((a, b) => a.publish.localeCompare(b.publish));
  const open = upcoming.filter((v) => !v.finished);
  const firstOpen = open[0] ?? null;

  const finishedBefore = firstOpen ? upcoming.filter((v) => v.publish < firstOpen.publish) : upcoming;
  const finishedUntil = finishedBefore.length ? finishedBefore[finishedBefore.length - 1].publish : null;

  // How far ahead the finished work reaches: up to the day before the
  // first unfinished video (or the last finished one when all are done).
  const reach = firstOpen ? addDays(firstOpen.publish, -1) : finishedUntil;
  const days = reach ? Math.max(0, Math.round((Date.parse(`${reach}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) + 1) : 0;
  const weeksAhead = Math.floor(days / 7);

  const lateCount = open.filter((v) => today > latestDate(v.publish)).length;
  const behindCount = open.filter((v) => today > targetDate(v.publish)).length;

  let health: Health;
  if (lateCount > 0) health = "late";
  else if (behindCount > 0) health = "behind";
  else if (weeksAhead >= 2 || (!firstOpen && upcoming.length > 0)) health = "ahead";
  else health = "on-target";

  return {
    health,
    weeksAhead,
    finishedUntil,
    next: firstOpen ? { publish: firstOpen.publish, target: targetDate(firstOpen.publish), latest: latestDate(firstOpen.publish) } : null,
    behindCount,
    lateCount,
  };
}

/** "2 weeks ahead", "Under a week ahead". */
export function aheadText(m: Meter): string {
  if (m.weeksAhead <= 0) return "Under a week ahead";
  return `${m.weeksAhead} week${m.weeksAhead === 1 ? "" : "s"} ahead`;
}
