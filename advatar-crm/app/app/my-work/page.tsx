import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { loadSubmissions } from "@/lib/submissions";
import { startOfToday, isPast } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The videographer's workspace: what they owe and when it's due.
 *
 * Handing work in used to happen here too. It moved to its own tab
 * (/app/uploads) because a submission stopped being a link with a
 * status: it now carries two comment threads, a checklist built from
 * the feedback, and the footage it was cut from. That does not belong
 * wedged between a deadline list and a to-do list, and squeezing it
 * in was making both harder to read.
 *
 * The submission figures stay on this page as tiles — "what is with
 * the reviewer" is genuinely part of what you owe — but each one is a
 * link to the tab that can act on it rather than a panel that
 * half-can.
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

  const [{ data: tasks }, submissions] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, text, due_date, done, client_id, assigned_to, clients(name)")
      .eq("assigned_to", user.id)
      .order("due_date", { nullsFirst: false }),
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

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">My Work</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        Your to-do list, what's due, and the work you've sent for review.
      </p>

      <div className="stat-row">
        <StatTile
          label="Tasks open"
          value={String(openTasks.length)}
          tone={overdue.length > 0 ? "danger" : "neutral"}
          hint={overdue.length > 0 ? `${overdue.length} overdue` : "none overdue"}
        />
        <StatTile label="Due this week" value={String(dueThisWeek.length)} hint="next seven days" />
        <StatTile label="Awaiting review" value={String(awaitingReview.length)} hint="with the reviewer" />
        {/* The only tile here that is a call to action: changes
            requested means the ball is back with them. */}
        <StatTile
          label="Changes requested"
          value={String(needsChanges.length)}
          tone={needsChanges.length > 0 ? "warn" : "neutral"}
          hint={needsChanges.length > 0 ? "needs a new version" : "nothing to redo"}
        />
      </div>

      <section className="section" style={{ maxWidth: 820 }}>
        <div className="section-head">
          <h2 className="section-title">Uploads</h2>
          <p className="section-sub">Cuts, feedback and the footage behind them</p>
        </div>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 12px", maxWidth: "60ch", lineHeight: 1.6 }}>
          Handing work in, replying to feedback and working through the checklist all
          live on the Uploads tab now — along with the raw footage for each client.
        </p>
        <Link href="/app/uploads" className="btn btn-primary" style={{ textDecoration: "none" }}>
          Go to Uploads
          {needsChanges.length > 0 ? ` — ${needsChanges.length} needing changes` : ""}
        </Link>
      </section>

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">Deadlines</h2>
          <p className="section-sub">
            {deadlines.length === 0 ? "Nothing with a date on it" : "Soonest first"}
          </p>
        </div>
        {deadlines.length === 0 ? (
          <EmptyState title="No dated work" body="None of your open tasks have a due date on them." compact />
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
                    padding: "13px 15px",
                    border: `1px solid ${late ? "var(--danger-border)" : today_ ? "var(--warn-border)" : "var(--border)"}`,
                    borderLeft: `3px solid ${late ? "var(--danger-fg)" : today_ ? "var(--warn-fg)" : "var(--border-2)"}`,
                    borderRadius: "var(--radius-sm)",
                    // Only late and due-today rows get a fill. Everything
                    // further out stays plain, so the two that matter
                    // are the two that stand out.
                    background: late ? "var(--danger-bg)" : today_ ? "var(--warn-bg)" : "var(--surface)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)", minWidth: 0 }}>
                    {t.text}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      color: late ? "var(--danger-fg)" : today_ ? "var(--warn-fg)" : "var(--text-3)",
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

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">To-do list</h2>
          <p className="section-sub">{openTasks.length === 0 ? "All clear" : `${openTasks.length} open`}</p>
        </div>
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
