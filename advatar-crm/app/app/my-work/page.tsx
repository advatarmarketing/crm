import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { SubmissionsPanel } from "@/components/SubmissionsPanel";
import { StatTile } from "@/components/StatTile";
import { loadSubmissions } from "@/lib/submissions";
import type { ClientChoice } from "@/components/SchedulePanel";
import { startOfToday, isPast } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The videographer's workspace: what they owe, when it's due, and the
 * work they've handed in for review.
 *
 * Submissions are link-based rather than file uploads — Supabase
 * storage isn't built for video, and the finished cuts already live
 * in Drive or Frame.io. What this tracks is the review round: which
 * version is current, where it sits in the workflow, and what the
 * reviewer said about it.
 */
export default async function MyWorkPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [{ data: tasks }, { data: clients }, submissions] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, text, due_date, done, client_id, assigned_to, clients(name)")
      .eq("assigned_to", user.id)
      .order("due_date", { nullsFirst: false }),
    supabase.from("clients").select("id, name").order("name"),
    loadSubmissions(supabase, { createdBy: user.id }),
  ]);

  type TaskRow = {
    id: string;
    text: string;
    due_date: string | null;
    done: boolean;
    client_id: string | null;
    assigned_to: string | null;
    clients: { name: string } | null;
  };
  const allTasks = (tasks ?? []) as unknown as TaskRow[];
  const openTasks = allTasks.filter((t) => !t.done);

  const todoEntries: TodoEntry[] = allTasks.map((t) => ({
    id: t.id,
    text: t.text,
    due_date: t.due_date,
    done: t.done,
    client_id: t.client_id,
    assigned_to: t.assigned_to,
    clientName: t.clients?.name ?? null,
  }));

  const overdue = openTasks.filter((t) => t.due_date && isPast(t.due_date));
  const dueThisWeek = openTasks.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return d >= today && d < weekEnd;
  });

  // Deadlines get their own list — a to-do list sorted by due date
  // still buries "due Friday" among things with no date at all.
  const deadlines = openTasks
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 12);

  const awaitingReview = submissions.filter((s) => s.status === "submitted" || s.status === "in_review");
  const needsChanges = submissions.filter((s) => s.status === "changes_requested");

  // Only clients this videographer is actually on — RLS has already
  // narrowed this, so the dropdown can't offer someone else's client.
  const clientChoices: ClientChoice[] = ((clients ?? []) as unknown as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <main className="page">
      <h1 className="page-title" style={{ marginBottom: 6 }}>
        My Work
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        Your to-do list, what's due, and the work you've sent for review.
      </p>

      <div className="stat-row" style={{ marginBottom: 36 }}>
        <StatTile label="Tasks open" value={String(openTasks.length)} hint={overdue.length > 0 ? `${overdue.length} overdue` : undefined} />
        <StatTile label="Due this week" value={String(dueThisWeek.length)} />
        <StatTile label="Awaiting review" value={String(awaitingReview.length)} />
        <StatTile
          label="Changes requested"
          value={String(needsChanges.length)}
          hint={needsChanges.length > 0 ? "needs a new version" : undefined}
        />
      </div>

      <section style={{ marginBottom: 40, maxWidth: 800 }}>
        <h2 style={heading}>Video submissions</h2>
        <p style={eyebrow}>Submitted → in review → changes requested → approved</p>
        <SubmissionsPanel
          initialSubmissions={submissions}
          canSubmit
          currentUserId={user.id}
          clients={clientChoices}
          emptyMessage="You haven't submitted any work yet."
        />
      </section>

      <section style={{ marginBottom: 40, maxWidth: 760 }}>
        <h2 style={heading}>Deadlines</h2>
        <p style={eyebrow}>
          {deadlines.length === 0 ? "Nothing with a date on it" : "Soonest first"}
        </p>
        {deadlines.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            None of your open tasks have a due date.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {deadlines.map((t) => {
              const late = isPast(t.due_date);
              const today_ = new Date(t.due_date!) >= today && new Date(t.due_date!) < tomorrow;
              return (
                <li
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${late ? "var(--status-closed)" : today_ ? "#c9a227" : "var(--border)"}`,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)", minWidth: 0 }}>
                    {t.text}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      color: late ? "var(--status-closed)" : "var(--text-3)",
                      flexShrink: 0,
                    }}
                  >
                    {t.clients?.name ? `${t.clients.name} · ` : ""}
                    {late ? "overdue " : today_ ? "today · " : ""}
                    {new Date(t.due_date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ maxWidth: 760 }}>
        <h2 style={heading}>To-do list</h2>
        <p style={eyebrow}>
          {openTasks.length === 0 ? "All clear" : `${openTasks.length} open`}
        </p>
        {/* editable={false} hides add/delete — a videographer has no
            insert or delete policy on `tasks`. The tick boxes work,
            through 0019's "videographer update own". */}
        <TodoPanel
          initialTasks={todoEntries}
          editable={false}
          emptyMessage="Nothing assigned to you right now."
          showClientLink={false}
        />
      </section>
    </main>
  );
}

const heading = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  margin: "0 0 4px",
};

const eyebrow = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-3)",
  margin: "0 0 14px",
};
