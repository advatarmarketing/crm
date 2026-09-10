// Structural, for the same reason as lib/submissions.ts — see the
// note there and in lib/supabase/admin.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/**
 * Reads `profiles.availability` without letting a missing column take
 * the page down.
 *
 * This exists because of a real outage. The Calendar tab and the
 * videographer detail page each selected `availability` alongside the
 * columns they actually need to function:
 *
 *     .select("role, full_name, availability")
 *
 * PostgREST rejects the WHOLE query when one column doesn't exist, so
 * on a database where 0026 hadn't been run yet, `profile` came back
 * null — and the page read that as "this user has no role" and
 * redirected to the login screen. Every role, on a page that had
 * nothing to do with signing in.
 *
 * The lesson is the shape, not the column: anything a page can render
 * perfectly well without should be fetched separately from the things
 * it can't. Here that means one small query whose failure is a
 * shrug — you get null, the panel says nothing is written down, and
 * the calendar above it works exactly as before.
 */
export async function loadAvailability(
  supabase: QueryableClient,
  profileId: string
): Promise<{ value: string | null; columnMissing: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("availability")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    // 42703 is Postgres' "undefined column". Anything else — a network
    // blip, a policy change — is also survivable here, but only the
    // missing column is worth telling the reader about, since it has a
    // fix they can act on (run the migration).
    const missing = error.code === "42703" || /column .*availability.* does not exist/i.test(error.message ?? "");
    return { value: null, columnMissing: missing };
  }

  return { value: (data as { availability?: string | null } | null)?.availability ?? null, columnMissing: false };
}
