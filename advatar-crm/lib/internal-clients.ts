// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/**
 * The ids of your own brands (0053: Personal brand and the business)
 * that the caller can see. They're kept out of client lists, Finance
 * and the pipeline. Empty before 0053 runs, so nothing is hidden.
 */
export async function internalClientIds(supabase: QueryableClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("clients").select("id").not("internal_kind", "is", null);
  return new Set(error ? [] : ((data ?? []) as { id: string }[]).map((r) => r.id));
}
