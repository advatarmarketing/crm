/**
 * Your Journey (0055): paths, levels, where each person is, and what
 * they've ticked. The minimum-level marker is in journey_private, which
 * only the CEO can read; for everyone else that query simply comes back
 * empty, so nothing here can leak it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export interface JourneyStep {
  id: string;
  text: string;
}

export interface JourneyLevel {
  id: string;
  path_id: string;
  key: string;
  position: number;
  title: string;
  summary: string | null;
  can_do: string[];
  clients_min: number | null;
  clients_max: number | null;
  clients_note: string | null;
  earn_min: number | null;
  earn_max: number | null;
  paid: boolean;
  vision: boolean;
  steps: JourneyStep[];
}

export interface JourneyPath {
  id: string;
  key: string;
  name: string;
  description: string | null;
  clients_word: string;
  position: number;
  levels: JourneyLevel[];
}

export interface JourneyTick {
  level_id: string;
  step_id: string;
  status: "pending" | "confirmed";
}

export interface JourneyVideo {
  id: string;
  kind: "started" | "now" | "next";
  url: string | null;
  title: string;
  note: string | null;
  level_id: string | null;
  added_at: string;
}

export interface JourneyData {
  available: boolean;
  person: { id: string; name: string };
  path: JourneyPath | null;
  levelId: string | null;
  startedOn: string | null;
  reached: Record<string, string>;
  ticks: JourneyTick[];
  videos: JourneyVideo[];
}

export { VIDEO_KINDS, clientsText, earnText } from "@/lib/journey-format";

export async function loadPaths(supabase: QueryableClient): Promise<{ available: boolean; paths: JourneyPath[] }> {
  const [p, l] = await Promise.all([
    supabase.from("journey_paths").select("*").order("position"),
    supabase.from("journey_levels").select("*").order("position"),
  ]);
  if (p.error) return { available: false, paths: [] };
  const levels = (l.data ?? []) as JourneyLevel[];
  return {
    available: true,
    paths: ((p.data ?? []) as Omit<JourneyPath, "levels">[]).map((path) => ({ ...path, levels: levels.filter((x) => x.path_id === path.id) })),
  };
}

/** The CEO's markers, by path. Empty for anyone else (RLS). */
export async function loadMinimums(supabase: QueryableClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("journey_private").select("path_id, minimum_level_id");
  return new Map(error ? [] : ((data ?? []) as { path_id: string; minimum_level_id: string | null }[]).filter((r) => r.minimum_level_id).map((r) => [r.path_id, r.minimum_level_id!]));
}

export async function loadJourney(supabase: QueryableClient, profileId: string, name: string): Promise<JourneyData> {
  const empty: JourneyData = { available: false, person: { id: profileId, name }, path: null, levelId: null, startedOn: null, reached: {}, ticks: [], videos: [] };
  const { available, paths } = await loadPaths(supabase);
  if (!available) return empty;
  const [m, r, t, v] = await Promise.all([
    supabase.from("journey_members").select("path_id, level_id, started_on").eq("profile_id", profileId).maybeSingle(),
    supabase.from("journey_reached").select("level_id, reached_on").eq("profile_id", profileId),
    supabase.from("journey_ticks").select("level_id, step_id, status").eq("profile_id", profileId),
    supabase.from("journey_videos").select("id, kind, url, title, note, level_id, added_at").eq("profile_id", profileId).order("added_at"),
  ]);
  const member = m.data as { path_id: string; level_id: string | null; started_on: string } | null;
  const path = member ? paths.find((p) => p.id === member.path_id) ?? null : null;
  return {
    available: true,
    person: { id: profileId, name },
    path,
    levelId: member?.level_id ?? null,
    startedOn: member?.started_on ?? null,
    reached: Object.fromEntries(((r.data ?? []) as { level_id: string; reached_on: string }[]).map((x) => [x.level_id, x.reached_on])),
    ticks: (t.data ?? []) as JourneyTick[],
    videos: (v.data ?? []) as JourneyVideo[],
  };
}

export interface TeamJourneyRow {
  id: string;
  name: string;
  role: string;
  pathId: string | null;
  levelId: string | null;
  waiting: number;
}

/** Everyone on the team and where they are. Management only (RLS). */
export async function loadTeamJourneys(supabase: QueryableClient): Promise<TeamJourneyRow[]> {
  const [people, members, ticks] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role").in("role", ["operations_manager", "staff", "videographer"]).order("full_name"),
    supabase.from("journey_members").select("profile_id, path_id, level_id"),
    supabase.from("journey_ticks").select("profile_id").eq("status", "pending"),
  ]);
  const byId = new Map(((members.data ?? []) as { profile_id: string; path_id: string; level_id: string | null }[]).map((x) => [x.profile_id, x]));
  const waiting = new Map<string, number>();
  for (const t of (ticks.data ?? []) as { profile_id: string }[]) waiting.set(t.profile_id, (waiting.get(t.profile_id) ?? 0) + 1);
  return ((people.data ?? []) as { id: string; full_name: string | null; role: string }[]).map((p) => ({
    id: p.id,
    name: p.full_name?.trim() || "Name not set",
    role: p.role,
    pathId: byId.get(p.id)?.path_id ?? null,
    levelId: byId.get(p.id)?.level_id ?? null,
    waiting: waiting.get(p.id) ?? 0,
  }));
}
