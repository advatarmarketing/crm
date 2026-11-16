/**
 * What each client gets (0041): how much say they have over the
 * videos, which extras they are paying for, and when we post.
 *
 * Pure functions and types only, so the client page, the server
 * actions and — in later phases — the calendar and the portal all
 * read a package the same way.
 *
 * Weekdays are ISO numbers throughout: 1 = Monday … 7 = Sunday. The
 * database stores the same numbers, so there is no translation to get
 * wrong between JavaScript's Sunday-first getDay() and what is saved.
 */

export type RevisionMode = "none" | "approve" | "full";
export type PostingMode = "weekdays" | "daily" | "per_week";

export interface PackageSettings {
  revisions: RevisionMode;
  /** Only meaningful with "full". Null means no fixed limit. */
  revision_rounds: number | null;
  thumbnails: boolean;
  graphics: boolean;
  posting_mode: PostingMode;
  /** The days we post on, for "weekdays". Ignored otherwise. */
  posting_weekdays: number[];
  /** For "per_week". Ignored otherwise. */
  videos_per_week: number | null;
  /** Days that carry two videos instead of one. */
  double_post_weekdays: number[];
}

export interface ClientPackage extends PackageSettings {
  client_id: string;
  preset_id: string | null;
  updated_at: string | null;
}

export interface PackagePreset extends PackageSettings {
  id: string;
  name: string;
}

export const WEEKDAYS: { n: number; short: string; long: string }[] = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
];

export const REVISION_LABELS: Record<RevisionMode, { title: string; detail: string }> = {
  none: {
    title: "We post for them",
    detail: "No review step. The client sees what is going out, with nothing to approve.",
  },
  approve: {
    title: "Approve only",
    detail: "The client watches each video and ticks it off. No change requests.",
  },
  full: {
    title: "Full revisions",
    detail: "The client can approve, or ask for changes with timestamped notes.",
  },
};

export const MAX_REVISION_ROUNDS = 20;
export const MAX_VIDEOS_PER_WEEK = 21;

/** Every new client starts here until somebody chooses otherwise. */
export const DEFAULT_PACKAGE: PackageSettings = {
  revisions: "none",
  revision_rounds: null,
  thumbnails: false,
  graphics: false,
  posting_mode: "weekdays",
  posting_weekdays: [1, 3, 5, 7],
  videos_per_week: null,
  double_post_weekdays: [],
};

function cleanDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  const set = new Set<number>();
  for (const d of days) {
    const n = Number(d);
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Turns whatever arrived (a form, a database row, a preset) into a
 * package that satisfies every rule 0041's constraints enforce, or an
 * error in plain words. The server actions save only what this
 * returns, so the database constraint is the second line, not the
 * first.
 */
export function normalizePackage(
  input: Partial<PackageSettings>
): { ok: true; value: PackageSettings } | { ok: false; error: string } {
  const revisions: RevisionMode =
    input.revisions === "approve" || input.revisions === "full" ? input.revisions : "none";

  let revision_rounds: number | null = null;
  if (revisions === "full" && input.revision_rounds != null && String(input.revision_rounds) !== "") {
    const n = Number(input.revision_rounds);
    if (!Number.isInteger(n) || n < 1 || n > MAX_REVISION_ROUNDS) {
      return { ok: false, error: `Revision rounds must be a whole number from 1 to ${MAX_REVISION_ROUNDS}, or left blank for no limit.` };
    }
    revision_rounds = n;
  }

  const posting_mode: PostingMode =
    input.posting_mode === "daily" || input.posting_mode === "per_week" ? input.posting_mode : "weekdays";

  const posting_weekdays = posting_mode === "weekdays" ? cleanDays(input.posting_weekdays) : [];
  if (posting_mode === "weekdays" && posting_weekdays.length === 0) {
    return { ok: false, error: "Pick at least one day we post on." };
  }

  let videos_per_week: number | null = null;
  if (posting_mode === "per_week") {
    const n = Number(input.videos_per_week);
    if (!Number.isInteger(n) || n < 1 || n > MAX_VIDEOS_PER_WEEK) {
      return { ok: false, error: `Videos a week must be a whole number from 1 to ${MAX_VIDEOS_PER_WEEK}.` };
    }
    videos_per_week = n;
  }

  // A double-post day only makes sense on a day we post at all. With
  // "N a week" the days are not fixed, so there is nothing to double.
  let double_post_weekdays = cleanDays(input.double_post_weekdays);
  if (posting_mode === "per_week") double_post_weekdays = [];
  if (posting_mode === "weekdays") double_post_weekdays = double_post_weekdays.filter((d) => posting_weekdays.includes(d));

  return {
    ok: true,
    value: {
      revisions,
      revision_rounds,
      thumbnails: Boolean(input.thumbnails),
      graphics: Boolean(input.graphics),
      posting_mode,
      posting_weekdays,
      videos_per_week,
      double_post_weekdays,
    },
  };
}

/** Videos in a normal week under this package. */
export function videosPerWeek(p: PackageSettings): number {
  if (p.posting_mode === "per_week") return p.videos_per_week ?? 0;
  const days = p.posting_mode === "daily" ? 7 : p.posting_weekdays.length;
  return days + p.double_post_weekdays.length;
}

function listDays(days: number[], form: "short" | "long" = "short"): string {
  const names = days.map((d) => WEEKDAYS[d - 1][form]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Mon, Wed, Fri and Sun · two on Sun · 5 a week". */
export function describePosting(p: PackageSettings): string {
  const parts: string[] = [];
  if (p.posting_mode === "daily") parts.push("Every day");
  else if (p.posting_mode === "per_week") parts.push(`${p.videos_per_week ?? 0} a week, days set as we go`);
  else parts.push(listDays(p.posting_weekdays));
  if (p.double_post_weekdays.length > 0) parts.push(`two on ${listDays(p.double_post_weekdays)}`);
  if (p.posting_mode !== "per_week") parts.push(`${videosPerWeek(p)} a week`);
  return parts.join(" · ");
}

/** The one-line summary shown in lists. */
export function describePackage(p: PackageSettings): string {
  const extras = [p.thumbnails && "thumbnails", p.graphics && "graphics & posters"].filter(Boolean);
  const rev =
    p.revisions === "full" && p.revision_rounds
      ? `Full revisions (${p.revision_rounds} round${p.revision_rounds === 1 ? "" : "s"})`
      : REVISION_LABELS[p.revisions].title;
  return [describePosting(p), rev, extras.length ? `+ ${extras.join(", ")}` : null].filter(Boolean).join(" · ");
}

/** ISO weekday (1 = Monday) of a calendar date. */
function isoWeekday(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

/**
 * For "N a week": which days of the week, spread as evenly as the
 * number allows, starting Monday. A suggestion the schedule starts
 * from, not a promise — the team moves them afterwards.
 */
export function spreadDays(perWeek: number): { day: number; count: number }[] {
  const counts = new Map<number, number>();
  for (let i = 0; i < perWeek; i++) {
    const day = (Math.floor((i * 7) / perWeek) % 7) + 1;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, count]) => ({ day, count }));
}

/**
 * Posting dates from `from` (inclusive) for `days` days, as
 * YYYY-MM-DD with how many videos go out that day. Works in UTC dates
 * so a preview never shifts by a day on a server in another zone.
 */
export function postingDates(p: PackageSettings, from: string, days: number): { date: string; count: number }[] {
  const start = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];

  const perDay = new Map<number, number>();
  if (p.posting_mode === "per_week") {
    for (const { day, count } of spreadDays(p.videos_per_week ?? 0)) perDay.set(day, count);
  } else {
    const base = p.posting_mode === "daily" ? [1, 2, 3, 4, 5, 6, 7] : p.posting_weekdays;
    for (const d of base) perDay.set(d, 1);
    for (const d of p.double_post_weekdays) if (perDay.has(d)) perDay.set(d, 2);
  }

  const out: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const count = perDay.get(isoWeekday(d)) ?? 0;
    if (count > 0) out.push({ date: d.toISOString().slice(0, 10), count });
  }
  return out;
}

/** Reads a row from client_packages / package_presets into the shape above. */
export function packageFromRow(row: Record<string, unknown>): PackageSettings {
  const parsed = normalizePackage(row as Partial<PackageSettings>);
  // A row the database accepted always passes; if it somehow does not,
  // fall back to the default rather than throwing on a page render.
  return parsed.ok ? parsed.value : DEFAULT_PACKAGE;
}
