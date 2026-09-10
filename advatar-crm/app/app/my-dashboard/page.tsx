import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SchedulePanel, type ScheduleEntry, type EventCategory } from "@/components/SchedulePanel";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { StatTile } from "@/components/StatTile";
import { UpcomingStrip } from "@/components/UpcomingStrip";
import { MonthCalendar } from "@/components/MonthCalendar";
import { Greeting } from "@/components/Greeting";
import { firstName as firstNameOf } from "@/lib/names";
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

  // The "coming up" strip looks past the seven-day window the rest of
  // this page uses — a shoot ten days out is exactly the thing you
  // want warning of, and it would otherwise appear from nowhere on the
  // Monday it becomes "this week".
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 30);

  // The month grid at the foot of the page needs the surrounding
  // months, not just what's ahead: its six-week layout reaches into
  // the month either side, and paging back a month should show
  // something rather than an empty grid. One query covers all of it
  // and the narrower views filter it down.
  const calendarFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const calendarTo = new Date(today.getFullYear(), today.getMonth() + 2, 1);

  const [{ data: profile }, { data: events }, { data: tasks }, { data: categories }, { data: threads }] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase
        .from("schedule_events")
        .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
        .gte("starts_at", calendarFrom.toISOString())
        .lt("starts_at", calendarTo.toISOString())
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
  const allEvents = (events ?? []) as unknown as EventRow[];
  const upcomingEvents = allEvents.filter((e) => {
    const at = new Date(e.starts_at);
    return at >= today && at < horizon;
  });
  const weekEvents = upcomingEvents.filter((e) => new Date(e.starts_at) < weekEnd);

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

  // Client names for the strip's cards. The list is already narrowed
  // by RLS to the clients this videographer is on.
  const { data: clientRows } = await supabase.from("clients").select("id, name");
  const clientNameById = new Map(
    ((clientRows ?? []) as unknown as { id: string; name: string | null }[]).map((c) => [
      c.id,
      c.name?.trim() || "Untitled client",
    ])
  );
  const withClientNames = (list: EventRow[]): EventRow[] =>
    list.map((e) => ({
      ...e,
      clientName: e.client_id ? clientNameById.get(e.client_id) ?? null : null,
    }));

  const upcomingWithClients = withClientNames(upcomingEvents);
  const monthEvents = withClientNames(allEvents);

  const who = firstNameOf((profile as { full_name?: string | null } | null)?.full_name);
  // The server's hour seeds the first paint; Greeting corrects it to
  // the reader's own clock on mount.
  const serverHour = new Date().getHours();

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
      <header style={{ marginBottom: 40 }}>
        <h1 className="page-title page-title-accent">
          <Greeting name={who} serverHour={serverHour} />
        </h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "14px 0 0" }}>
          {today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>

      <div className="stat-row">
        <StatTile
          label="On today"
          value={String(todays.length)}
          tone={todays.length > 0 ? "accent" : "neutral"}
          hint={todays.length > 0 ? "check the times below" : "nothing booked"}
        />
        <StatTile label="This week" value={String(weekEvents.length)} hint="next seven days" />
        <StatTile
          label="Tasks open"
          value={String(myTasks.length)}
          tone={overdue.length > 0 ? "danger" : "neutral"}
          hint={overdue.length > 0 ? `${overdue.length} overdue` : "none overdue"}
        />
        <Link href="/app/messages" style={{ textDecoration: "none", flex: "1 1 180px", minWidth: 170 }}>
          <StatTile
            label="Unread messages"
            value={String(unreadCount)}
            tone={unreadCount > 0 ? "warn" : "neutral"}
          />
        </Link>
      </div>

      {notifications.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Notifications</h2>
            <p className="section-sub">What needs you right now</p>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {notifications.map((n) => (
              <li key={n.id}>
                <a
                  href={n.href}
                  className="card-link"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "13px 16px",
                    border: `1px solid ${
                      n.severity === "bad"
                        ? "var(--danger-border)"
                        : n.severity === "warn"
                        ? "var(--warn-border)"
                        : "var(--ok-border)"
                    }`,
                    borderLeft: `3px solid ${
                      n.severity === "bad"
                        ? "var(--danger-fg)"
                        : n.severity === "warn"
                        ? "var(--warn-fg)"
                        : "var(--ok-fg)"
                    }`,
                    borderRadius: "var(--radius-sm)",
                    background:
                      n.severity === "bad"
                        ? "var(--danger-bg)"
                        : n.severity === "warn"
                        ? "var(--warn-bg)"
                        : "var(--ok-bg)",
                    minHeight: 50,
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

      {/* Prompt 8: the compact "coming up" view. Deliberately not the
          month grid — that lives on the Calendar tab, and a whole
          month is not what you open a dashboard to find out. */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Coming up</h2>
          <p className="section-sub">
            The next month ·{" "}
            <Link href="/app/calendar" style={{ color: "var(--accent)" }}>
              full calendar
            </Link>
          </p>
        </div>
        <UpcomingStrip
          events={upcomingWithClients}
          categories={eventCategories}
          emptyMessage="Nothing booked in over the next month."
        />
      </section>

      <section id="today" className="section" style={{ maxWidth: 780, scrollMarginTop: 90 }}>
        <div className="section-head">
          <h2 className="section-title">Today</h2>
          <p className="section-sub">Shoots and anything else booked in</p>
        </div>
        <SchedulePanel
          initialEvents={todays}
          categories={eventCategories}
          emptyMessage="Nothing booked in today."
        />
      </section>

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">This week</h2>
          <p className="section-sub">The next seven days</p>
        </div>
        <SchedulePanel
          initialEvents={weekEvents}
          categories={eventCategories}
          emptyMessage="Nothing booked in this week."
        />
        <Link
          href="/app/calendar"
          className="btn"
          style={{ textDecoration: "none", display: "inline-block", marginTop: 12 }}
        >
          Full calendar →
        </Link>
      </section>

      {/* The same month grid the staff and CEO dashboards carry. The
          strip at the top answers "what's next"; this answers "how
          busy is the month", which a list can't. Read-only, as
          everywhere on this page — booking is the office's job. */}
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">The month</h2>
          <p className="section-sub">
            Everything in your diary ·{" "}
            <Link href="/app/calendar" style={{ color: "var(--accent)" }}>
              open the calendar
            </Link>
          </p>
        </div>
        <MonthCalendar events={monthEvents} categories={eventCategories} />
      </section>

      <section id="tasks" className="section" style={{ maxWidth: 780, scrollMarginTop: 90 }}>
        <div className="section-head">
          <h2 className="section-title">Your tasks</h2>
          <p className="section-sub">
          {myTasks.length === 0
            ? "All clear"
            : `${myTasks.length} open${overdue.length > 0 ? ` · ${overdue.length} overdue` : ""}`}
          </p>
        </div>
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
