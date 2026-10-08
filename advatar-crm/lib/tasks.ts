// Structural, for the same reason as lib/profile-fields.ts — see the
// note there.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = { from: (table: string) => any };

export type TaskPriority = "urgent" | "high" | "normal" | "low";

/**
 * The four levels, in the order the list reads in.
 *
 * `normal` carries no pill. A to-do list where every row wears a
 * coloured label tells you nothing — the same reasoning that keeps
 * only overdue rows tinted in TodoPanel. `low` does carry one, quietly,
 * so that deliberately parking something is visible rather than
 * silent; otherwise "low" and "never got round to setting it" would
 * look identical.
 */
export const TASK_PRIORITIES: {
  id: TaskPriority;
  label: string;
  /** The .pill class that paints it, or null for no pill at all. */
  pill: string | null;
}[] = [
  { id: "urgent", label: "Urgent", pill: "pill pill-danger" },
  { id: "high", label: "High", pill: "pill pill-warn" },
  { id: "normal", label: "Normal", pill: null },
  { id: "low", label: "Low", pill: "pill" },
];

const RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function priorityRank(p: TaskPriority | null | undefined): number {
  return RANK[p ?? "normal"] ?? RANK.normal;
}

export function priorityLabel(p: TaskPriority | null | undefined): string {
  return TASK_PRIORITIES.find((x) => x.id === (p ?? "normal"))?.label ?? "Normal";
}

export function isTaskPriority(v: unknown): v is TaskPriority {
  return v === "urgent" || v === "high" || v === "normal" || v === "low";
}

/**
 * Fills in each to-do's priority without letting a missing column take
 * the page down.
 *
 * Deliberately a SECOND query rather than another name in the page's
 * `.select(...)`. PostgREST rejects the whole query when one column
 * does not exist, so adding "priority" to the main select would empty
 * the to-do list on every page of the app on any database where 0037
 * has not been run yet — and this app adds columns through migrations
 * run by hand, so "the code is deployed, the database isn't" is the
 * normal state of things here rather than a rare one. See
 * lib/profile-fields.ts, which exists because exactly that took the
 * Calendar tab down once.
 *
 * So a failure here is a shrug: every to-do reads as `normal`,
 * `priorityAvailable` comes back false, and the priority control hides
 * itself until the migration is run.
 */
export async function withTaskPriorities<T extends { id: string }>(
  supabase: QueryableClient,
  entries: T[]
): Promise<{ tasks: (T & { priority: TaskPriority })[]; priorityAvailable: boolean }> {
  // No to-dos to fill in, but someone may add one and then open it, so
  // ask the cheapest question that still answers whether the column is
  // there.
  if (entries.length === 0) {
    const { error } = await supabase.from("tasks").select("priority").limit(1);
    return { tasks: [], priorityAvailable: !error };
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("id, priority")
    .in(
      "id",
      entries.map((e) => e.id)
    );

  if (error) {
    return {
      tasks: entries.map((e) => ({ ...e, priority: "normal" as TaskPriority })),
      priorityAvailable: false,
    };
  }

  const byId = new Map<string, TaskPriority>();
  for (const row of (data ?? []) as { id: string; priority: unknown }[]) {
    if (row.id && isTaskPriority(row.priority)) byId.set(row.id, row.priority);
  }

  return {
    tasks: entries.map((e) => ({ ...e, priority: byId.get(e.id) ?? ("normal" as TaskPriority) })),
    priorityAvailable: true,
  };
}
