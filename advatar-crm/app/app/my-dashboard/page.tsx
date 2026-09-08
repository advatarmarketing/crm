import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SchedulePanel, type ScheduleEntry, type EventCategory } from "@/components/SchedulePanel";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { StatTile } from "@/components/StatTile";
import { startOfToday, isPast } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The videographer's front page: what's on today, what's coming this
 * week, what they owe, and anything that has slipped.
 *
 * Everything is read under their own session, so RLS decides what
 * appears — the schedule policy from 0018 gives them their own
 * entries and their assigned clients', and the task policies give
 * them what's assigned to them. Ticking a task off works because 0019
 * added the matching update policy; booking is not theirs to do, so
 * the schedule is read-only here.
 *
 * "Notifications" is deliberately derived rather than a real
 * notification system — unread messages, work starting today, and
 * anything overdue. There is no push/email delivery behind it; that
 * is a separate piece of work.
 */
export default async function MyDashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = startOfToday();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [{ data: profile }, { data: events }, { data: tasks }, { data: categories }, { data: threads }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("schedule_events")
        .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
        .gte("starts_at", today.toISOString())
        .lt("starts_at", weekEnd.toISOString())
        .order("starts_at"),
      supabase
        .from("tasks")
        .select("id, text, due_date, done, client_id, assigned_to, clients(name)")
        .eq("assigned_to", user.id)
        .eq("done", false),
      supabase.from("event_categories").select("id, name, colour").order("position"),
      supabase.from("message_threads").select("id, client_id, clients(name)"),
    ]);

  const eventCategories = (categories ?? []) as unknown as EventCategory[];
  const categoryName = new Map(eventCategories.map((c) => [c.id, c.name]));

  type EventRow = ScheduleEntry;
  const weekEvents = (events ?? []) as unknown as EventRow[];

  // Today's entries, split out from the rest of the week.
  const todays = weekEvents.filter((e) => {
    const d = new Date(e.starts_at);
    return d >= today && d < tomorrow;
  });

  type TaskRow = {
    id: string;
    text: string;
    due_date: string | null;
    done: boolean;
    client_id: string | null;
    assigned_to: string | null;
    clients: { name: string } | null;
  };
  const myTasks = (tasks ?? []) as unknown as TaskRow[];

  const todoEntries: TodoEntry[] = myTasks.map((t) => ({
    id: t.id,
    text: t.text,
    due_date: t.due_date,
    done: t.done,
    client_id: t.client_id,
    assigned_to: t.assigned_to,
    clientName: t.clients?.name ?? null,
  }));

  const overdue = myTasks.filter((t) => t.due_date && isPast(t.due_date));
  const dueToday = myTasks.filter(
    (t) => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) < tomorrow
  );

  // Unread = someone else's message this person hasn't opened. Counted
  // per thread they can see, which RLS has already limited to their
  // assigned clients.
  const threadRows = (threads ?? []) as unknown as { id: string; client_id: string; clients: { name: string } | null }[];
  let unreadCount = 0;
  if (threadRows.length > 0) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in(
        "thread_id",
        threadRows.map((t) => t.id)
      )
      .eq("read", false)
      .neq("sender_id", user.id);
    unreadCount = count ?? 0;
  }

  const firstName = (profile as { full_name?: string | null } | null)?.full_name?.trim()?.split(/\s+/)[0];

  const notifications: { id: string; text: string; href: string; severity: "bad" | "warn" | "ok" }[] = [];

  if (overdue.length > 0) {
    notifications.push({
      id: "overdue",
      text: `${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue`,
      href: "#tasks",
      severity: "bad",
    });
  }
  if (dueToday.length > 0) {
    notifications.push({
      id: "due-today",
      text: `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today`,
      href: "#tasks",
      severity: "warn",
    });
  }
  if (todays.length > 0) {
    notifications.push({
      id: "today",
      text: `${todays.length} thing${todays.length === 1 ? "" : "s"} on today`,
      href: "#today",
      severity: "ok",
    });
  }
  if (unreadCount > 0) {
    notifications.push({
      id: "messages",
      text: `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`,
      href: "/app/messages",
      severity: "warn",
    });
  }

  return (
    <main className="page">
      <h1 className="page-title" style={{ marginBottom: 4 }}>
        {firstName ? `Morning, ${firstName}` : "Your day"}
      </h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "0 0 28px" }}>
        {today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
      </p>

      <div className="stat-row" style={{ marginBottom: 36 }}>
        <StatTile label="On today" value={String(todays.length)} />
        <StatTile label="This week" value={String(weekEvents.length)} />
        <StatTile label="Tasks open" value={String(myTasks.length)} hint={overdue.length > 0 ? `${overdue.length} overdue` : undefined} />
        <Link href="/app/messages" style={{ textDecoration: "none", flex: "1 1 160px", minWidth: 160 }}>
          <StatTile label="Unread messages" value={String(unreadCount)} />
        </Link>
      </div>

      {notifications.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={heading}>Notifications</h2>
          <p style={eyebrow}>What needs you right now</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {notifications.map((n) => (
              <li key={n.id}>
                <a
                  href={n.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 13px",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid ${
                      n.severity === "bad"
                        ? "var(--status-closed)"
                        : n.severity === "warn"
                        ? "var(--status-paused, #c90)"
                        : "var(--status-active)"
                    }`,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                    textDecoration: "none",
                    fontFamily: "var(--font-body)",
                    fontSize: 13.5,
                    color: "var(--text-1)",
                  }}
                >
                  {n.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="today" style={{ marginBottom: 36, maxWidth: 760, scrollMarginTop: 70 }}>
        <h2 style={heading}>Today</h2>
        <p style={eyebrow}>Shoots and anything else booked in</p>
        <SchedulePanel
          initialEvents={todays}
          categories={eventCategories}
          emptyMessage="Nothing booked in today."
        />
      </section>

      <section style={{ marginBottom: 36, maxWidth: 760 }}>
        <h2 style={heading}>This week</h2>
        <p style={eyebrow}>The next seven days</p>
        <SchedulePanel
          initialEvents={weekEvents}
          categories={eventCategories}
          emptyMessage="Nothing booked in this week."
        />
        <Link
          href="/app/my-calendar"
          className="btn"
          style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}
        >
          Full calendar →
        </Link>
      </section>

      <section id="tasks" style={{ maxWidth: 760, scrollMarginTop: 70 }}>
        <h2 style={heading}>Your tasks</h2>
        <p style={eyebrow}>
          {myTasks.length === 0
            ? "All clear"
            : `${myTasks.length} open${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}`}
        </p>
        {/* editable={false} hides the add and delete controls — a
            videographer has no insert or delete policy on `tasks`, so
            those would fail. The tick boxes are always rendered and do
            work, via 0019's "videographer update own" policy. */}
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
