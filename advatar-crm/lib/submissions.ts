import type { SubmissionEntry, SubmissionVersion, SubmissionFeedback } from "@/components/SubmissionsPanel";

/**
 * Structural, rather than `SupabaseClient<Database>`.
 *
 * The hand-written Database type in lib/supabase/types.ts doesn't
 * match what the installed supabase-js expects (see the long note in
 * lib/supabase/admin.ts), so a typed client won't assign to a
 * `SupabaseClient<Database>` parameter — the call site fails to
 * compile even though the query is valid. Taking just the shape this
 * function uses sidesteps that without pretending the generic works.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/**
 * Loads submissions with their versions and feedback attached.
 *
 * Three flat queries rather than nested embeds: the child tables have
 * their own RLS (0020), and keeping them separate makes it obvious
 * that a videographer seeing no feedback means the policy returned
 * nothing, not that an embed silently dropped it.
 *
 * `filter` narrows the parent query — by person for the admin view of
 * one videographer, by nothing for "everything I can see". RLS still
 * applies on top either way.
 */
export async function loadSubmissions(
  supabase: QueryableClient,
  filter?: { createdBy?: string; clientId?: string }
): Promise<SubmissionEntry[]> {
  let query = supabase
    .from("submissions")
    .select("id, title, brief, status, current_version, client_id, created_by, created_at")
    .order("created_at", { ascending: false });

  if (filter?.createdBy) query = query.eq("created_by", filter.createdBy);
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);

  const { data: rows } = await query;
  const submissions = (rows ?? []) as unknown as Omit<SubmissionEntry, "versions" | "feedback">[];

  if (submissions.length === 0) return [];

  const ids = submissions.map((s) => s.id);

  const [{ data: versions }, { data: feedback }, { data: people }, { data: clients }] = await Promise.all([
    supabase
      .from("submission_versions")
      .select("id, submission_id, version, url, notes, created_at")
      .in("submission_id", ids)
      .order("version", { ascending: false }),
    supabase
      .from("submission_feedback")
      .select("id, submission_id, version, body, author_id, created_at")
      .in("submission_id", ids)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("clients").select("id, name"),
  ]);

  const nameById = new Map(
    ((people ?? []) as unknown as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name?.trim() || null,
    ])
  );
  const clientNameById = new Map(
    ((clients ?? []) as unknown as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );

  const versionsBySubmission = new Map<string, SubmissionVersion[]>();
  for (const v of (versions ?? []) as unknown as (SubmissionVersion & { submission_id: string })[]) {
    if (!versionsBySubmission.has(v.submission_id)) versionsBySubmission.set(v.submission_id, []);
    versionsBySubmission.get(v.submission_id)!.push(v);
  }

  const feedbackBySubmission = new Map<string, SubmissionFeedback[]>();
  for (const f of (feedback ?? []) as unknown as (SubmissionFeedback & {
    submission_id: string;
    author_id: string | null;
  })[]) {
    if (!feedbackBySubmission.has(f.submission_id)) feedbackBySubmission.set(f.submission_id, []);
    feedbackBySubmission.get(f.submission_id)!.push({
      ...f,
      authorName: f.author_id ? nameById.get(f.author_id) ?? null : null,
    });
  }

  return submissions.map((s) => ({
    ...s,
    clientName: s.client_id ? clientNameById.get(s.client_id) ?? null : null,
    personName: s.created_by ? nameById.get(s.created_by) ?? null : null,
    versions: versionsBySubmission.get(s.id) ?? [],
    feedback: feedbackBySubmission.get(s.id) ?? [],
  }));
}
