import type { SopWithChecklist, ChecklistStep } from "@/components/SopChecklist";

// Structural, for the same reason as lib/submissions.ts — see the
// note there and in lib/supabase/admin.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

/**
 * Loads the SOPs a person can see, each with its checklist steps and
 * that person's own tick state merged in.
 *
 * Progress rows only exist for steps somebody has actually touched,
 * so a missing row means "not done" — the merge below treats it that
 * way rather than assuming every step has a row.
 */
export async function loadSopsWithChecklists(
  supabase: QueryableClient,
  userId: string,
  audienceRole: string
): Promise<SopWithChecklist[]> {
  // RLS on `resources` (0018) already limits this to what the caller
  // may see; the audience filter narrows it to the tab being viewed.
  const { data: resourceRows } = await supabase
    .from("resources")
    .select("id, title, kind, url, body, audience_role, assigned_to")
    .in("audience_role", [audienceRole, "all"])
    .order("position");

  const sops = (resourceRows ?? []) as {
    id: string;
    title: string;
    kind: string;
    url: string | null;
    body: string | null;
  }[];

  if (sops.length === 0) return [];

  const ids = sops.map((s) => s.id);

  const [{ data: itemRows }, { data: progressRows }] = await Promise.all([
    supabase
      .from("resource_checklist_items")
      .select("id, resource_id, text, position")
      .in("resource_id", ids)
      .order("position"),
    supabase.from("resource_checklist_progress").select("item_id, done").eq("user_id", userId),
  ]);

  const doneByItem = new Map(
    ((progressRows ?? []) as { item_id: string; done: boolean }[]).map((p) => [p.item_id, p.done])
  );

  const stepsByResource = new Map<string, ChecklistStep[]>();
  for (const i of (itemRows ?? []) as { id: string; resource_id: string; text: string; position: number }[]) {
    if (!stepsByResource.has(i.resource_id)) stepsByResource.set(i.resource_id, []);
    stepsByResource.get(i.resource_id)!.push({
      id: i.id,
      text: i.text,
      position: i.position,
      done: doneByItem.get(i.id) ?? false,
    });
  }

  return sops.map((s) => ({
    ...s,
    steps: stepsByResource.get(s.id) ?? [],
  }));
}
