/**
 * The Schedule tab: a week laid out by the hour.
 *
 * Times here are minutes from midnight, never timestamps, and that is
 * deliberate. A weekly routine has no date to hang a timestamp on, and
 * "gym at 06:30 on Mondays" should still be 06:30 after the clocks
 * change rather than drifting to 05:30 for half the year. Only a block
 * pushed to the company calendar becomes a real timestamp, at the
 * moment it is pushed.
 */

// Structural, for the same reason as lib/notes.ts — see the note there.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

import { NOTE_COLOURS, type NoteColour } from "./notes";

/** The label colours, shared with Notes so one palette runs through. */
export const BLOCK_COLOURS = NOTE_COLOURS;
export type BlockColour = NoteColour;

/** What the company calendar accepts (0018). */
export const CALENDAR_KINDS = ["shoot", "call", "meeting", "deadline", "other"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export interface PlannerPreset {
  id: string;
  name: string;
  color: BlockColour | null;
  default_minutes: number;
  calendar_kind: CalendarKind;
  position: number;
}

export interface PlannerBlock {
  id: string;
  title: string;
  notes: string;
  /** 0 = Monday, matching the grid. */
  weekday: number;
  start_minute: number;
  end_minute: number;
  /** Null exactly when this repeats. */
  on_date: string | null;
  repeats: boolean;
  color: BlockColour | null;
  calendar_kind: CalendarKind;
  /** Set when this block also sits on the company calendar. */
  schedule_event_id: string | null;
}

export interface Weekbook {
  /** False when 0036 has not been run. */
  available: boolean;
  blocks: PlannerBlock[];
  presets: PlannerPreset[];
}

/** A missing table: 42P01 from Postgres, PGRST205 from PostgREST. */
function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export const BLOCK_COLUMNS =
  "id, title, notes, weekday, start_minute, end_minute, on_date, repeats, color, calendar_kind, schedule_event_id";
export const PRESET_COLUMNS = "id, name, color, default_minutes, calendar_kind, position";

/**
 * Everything needed to draw somebody's week.
 *
 * No owner filter, and none needed: both tables are owner-only (0036),
 * so the database returns this person's rows whoever is asking.
 * Filtering here as well would suggest the filter is what keeps a week
 * private, and it is not.
 *
 * Repeating blocks are fetched whole — there are only ever a handful —
 * and dated blocks are narrowed to the window being looked at.
 */
export async function loadWeekbook(
  supabase: QueryableClient,
  fromISO: string,
  toISO: string
): Promise<Weekbook> {
  const [repeating, dated, presets] = await Promise.all([
    supabase.from("planner_blocks").select(BLOCK_COLUMNS).eq("repeats", true),
    supabase
      .from("planner_blocks")
      .select(BLOCK_COLUMNS)
      .eq("repeats", false)
      .gte("on_date", fromISO)
      .lte("on_date", toISO),
    supabase.from("planner_presets").select(PRESET_COLUMNS).order("position").order("name"),
  ]);

  if (isMissingTable(repeating.error) || isMissingTable(dated.error) || isMissingTable(presets.error)) {
    return { available: false, blocks: [], presets: [] };
  }

  return {
    available: true,
    blocks: [...((repeating.data ?? []) as PlannerBlock[]), ...((dated.data ?? []) as PlannerBlock[])],
    presets: (presets.data ?? []) as PlannerPreset[],
  };
}

// =================================================================
// Dates and times
// =================================================================

/**
 * The Monday of the week a date falls in.
 *
 * Local midnight, not UTC: the grid is somebody's day as they live it,
 * and a week that starts at 01:00 on Monday in summer is wrong.
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay() is 0 for Sunday; the grid starts on Monday.
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * YYYY-MM-DD in local time.
 *
 * NOT toISOString().slice(0, 10), which converts to UTC first and so
 * reports the previous day for any evening in British Summer Time —
 * which would file a Monday evening block under Sunday.
 */
export function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 540 -> "09:00". */
export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:00" -> 540. Returns null for anything that isn't a time. */
export function labelToMinutes(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  if (h > 23 || mins > 59) return null;
  return h * 60 + mins;
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * The blocks on one day of the week being shown.
 *
 * A dated block wins over a repeating one at the same time: putting
 * something specific in the diary is how you say "not the usual thing
 * today". Both are still returned — the grid draws them side by side —
 * but the dated one is listed first so it reads as the answer.
 */
export function blocksForDay(blocks: PlannerBlock[], weekday: number, date: string): PlannerBlock[] {
  return blocks
    .filter((b) => (b.repeats ? b.weekday === weekday : b.on_date === date))
    .sort((a, b) => {
      if (a.repeats !== b.repeats) return a.repeats ? 1 : -1;
      return a.start_minute - b.start_minute || a.end_minute - b.end_minute;
    });
}

/**
 * Lays overlapping blocks out side by side.
 *
 * Without this two things at the same time would sit exactly on top of
 * each other and the one underneath would be invisible — which on a
 * planner means a clash you cannot see, the one thing it exists to
 * show you.
 */
export interface LaidOut {
  block: PlannerBlock;
  /** 0-based column within its overlapping group. */
  column: number;
  /** How many columns that group needs. */
  columns: number;
}

export function layOutDay(dayBlocks: PlannerBlock[]): LaidOut[] {
  const byStart = [...dayBlocks].sort((a, b) => a.start_minute - b.start_minute);
  const out: LaidOut[] = [];

  let group: PlannerBlock[] = [];
  let groupEnd = -1;

  const flush = () => {
    // Within a group, give each block the first column free at its
    // start time, so three things at once become three columns and not
    // three overlapping slabs.
    const columnEnds: number[] = [];
    const placed: { block: PlannerBlock; column: number }[] = [];

    for (const b of group) {
      let col = columnEnds.findIndex((end) => end <= b.start_minute);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(b.end_minute);
      } else {
        columnEnds[col] = b.end_minute;
      }
      placed.push({ block: b, column: col });
    }

    for (const p of placed) out.push({ ...p, columns: columnEnds.length });
    group = [];
    groupEnd = -1;
  };

  for (const b of byStart) {
    if (group.length > 0 && b.start_minute >= groupEnd) flush();
    group.push(b);
    groupEnd = Math.max(groupEnd, b.end_minute);
  }
  if (group.length > 0) flush();

  return out;
}

// =================================================================
// The starter set
// =================================================================

/**
 * What a new week-planner starts with.
 *
 * Added once, the first time somebody opens the tab, so the grid is
 * usable immediately rather than being an empty page with an empty
 * list of saved items beside it. They are ordinary rows from that
 * moment: rename them, recolour them, delete the ones that are not
 * yours.
 */
export const STARTER_PRESETS: Omit<PlannerPreset, "id">[] = [
  { name: "Qur'an", color: "green", default_minutes: 30, calendar_kind: "other", position: 0 },
  { name: "Gym", color: "teal", default_minutes: 60, calendar_kind: "other", position: 1 },
  { name: "Deep work", color: "purple", default_minutes: 120, calendar_kind: "other", position: 2 },
  { name: "Meeting", color: "blue", default_minutes: 60, calendar_kind: "meeting", position: 3 },
  { name: "Client call", color: "blue", default_minutes: 30, calendar_kind: "call", position: 4 },
  { name: "Self content", color: "pink", default_minutes: 90, calendar_kind: "other", position: 5 },
  { name: "Filming", color: "red", default_minutes: 180, calendar_kind: "shoot", position: 6 },
  { name: "Editing", color: "orange", default_minutes: 120, calendar_kind: "other", position: 7 },
  { name: "Admin & inbox", color: "gold", default_minutes: 45, calendar_kind: "other", position: 8 },
  { name: "Family", color: "green", default_minutes: 120, calendar_kind: "other", position: 9 },
];
