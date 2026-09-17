// Structural, for the same reason as lib/submissions.ts — see the
// note there and in lib/supabase/admin.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/**
 * Reads one optional column off a profile without letting a missing
 * column take the page down.
 *
 * This exists because of a real outage, and the shape is the lesson
 * rather than any particular column. The Calendar tab and the
 * videographer detail page each selected `availability` alongside the
 * columns they actually need to function:
 *
 *     .select("role, full_name, availability")
 *
 * PostgREST rejects the WHOLE query when one column doesn't exist, so
 * on a database where the migration hadn't been run yet, `profile`
 * came back null — and the page read that as "this user has no role"
 * and redirected to the login screen. Every role, on a page with
 * nothing to do with signing in.
 *
 * So: anything a page can render perfectly well without is fetched
 * separately from the things it can't. A failure here is a shrug —
 * you get null, that one field renders as unset, and the rest of the
 * page is untouched.
 *
 * This app adds columns through hand-run migrations, which means the
 * code is routinely deployed before the database has caught up. That
 * is not a bug to be fixed once; it is the normal state of things
 * here, and this is how a page survives it.
 */
export async function loadProfileField(
  supabase: QueryableClient,
  profileId: string,
  column: "availability" | "notify_email"
): Promise<{ value: string | null; columnMissing: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select(column)
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    // 42703 is Postgres' "undefined column". Anything else — a network
    // blip, a policy change — is also survivable here, but only the
    // missing column is worth telling the reader about, since it has a
    // fix they can act on (run the migration).
    const missing =
      error.code === "42703" ||
      new RegExp(`column .*${column}.* does not exist`, "i").test(error.message ?? "");
    return { value: null, columnMissing: missing };
  }

  const row = data as Record<string, string | null> | null;
  return { value: row?.[column] ?? null, columnMissing: false };
}

/**
 * The same, for a list of people at once.
 *
 * One query rather than one per person, and the same tolerance: a
 * missing column gives an empty map and every caller reads null.
 */
export async function loadProfileFieldMany(
  supabase: QueryableClient,
  profileIds: string[],
  column: "availability" | "notify_email"
): Promise<Map<string, string | null>> {
  const found = new Map<string, string | null>();
  if (profileIds.length === 0) return found;

  const { data, error } = await supabase.from("profiles").select(`id, ${column}`).in("id", profileIds);

  if (error) return found;

  for (const row of (data ?? []) as Record<string, string | null>[]) {
    if (row.id) found.set(row.id, row[column] ?? null);
  }

  return found;
}
