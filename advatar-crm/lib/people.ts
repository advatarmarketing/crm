// Structural, for the same reason as lib/submissions.ts — see the
// note there and in lib/supabase/admin.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export interface TeamMember {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
}

/**
 * Who's who, for putting a name on a message.
 *
 * Reads `team_directory` (0031) rather than `profiles`, and that
 * distinction is the whole point of this function existing.
 *
 * `profiles` is readable by the CEO, staff and the operations manager
 * and by nobody else — so a videographer looking at The Crew, or a
 * client looking at the replies on their own video, could not resolve
 * a single name and saw "Someone" against every message. The view
 * carries the four display fields and leaves phone, notification
 * email and availability behind, so it can safely be read by anyone
 * signed in.
 *
 * ---------------------------------------------------------------
 * The fallback
 * ---------------------------------------------------------------
 * This app deploys code before its migrations are run by hand, so
 * this has to work on a database that has never heard of the view.
 * When the view is missing it falls back to `profiles`, which is
 * exactly what every one of these call sites did before — management
 * still gets names, and everyone else is no worse off than they are
 * today. The fallback disappears on its own once 0031 is run; it is
 * not a permanent second code path.
 */
export async function loadTeamDirectory(supabase: QueryableClient): Promise<TeamMember[]> {
  const { data, error } = await supabase.from("team_directory").select("id, full_name, role, avatar_url");

  if (!error) return (data ?? []) as TeamMember[];

  const { data: fallback } = await supabase.from("profiles").select("id, full_name, role, avatar_url");
  return (fallback ?? []) as TeamMember[];
}

/**
 * The same, reduced to what almost every caller actually wants: a map
 * from author id to the name to print.
 *
 * Trimmed, and empty strings folded to null, so a profile saved with
 * a blank name renders as the caller's own fallback rather than as
 * nothing at all.
 */
export async function loadNamesById(supabase: QueryableClient): Promise<Map<string, string | null>> {
  const people = await loadTeamDirectory(supabase);
  return new Map(people.map((p) => [p.id, p.full_name?.trim() || null]));
}
