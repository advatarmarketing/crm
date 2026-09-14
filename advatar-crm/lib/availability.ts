import { loadProfileField } from "@/lib/profile-fields";

/**
 * Reads `profiles.availability` without letting a missing column take
 * the page down.
 *
 * The tolerant read itself now lives in lib/profile-fields.ts, because
 * `notify_email` (0030) needed exactly the same treatment and two
 * copies of a rule this subtle would eventually disagree. The long
 * explanation of WHY it is needed is there too.
 */
export async function loadAvailability(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  profileId: string
): Promise<{ value: string | null; columnMissing: boolean }> {
  return loadProfileField(supabase, profileId, "availability");
}
