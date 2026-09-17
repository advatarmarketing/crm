import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

/**
 * What the agency is waiting on from this client.
 *
 * The convention, and it matters: a task on a client with **nobody
 * assigned to it** is the client's to do. Anything assigned to a
 * member of the team is the team's own work and stays off this page —
 * a client seeing "chase invoice" or "re-grade the b-roll" in their
 * own to-do list is confusing at best.
 *
 * That is a presentation rule, not a security one. `tasks`' RLS
 * ("tasks: client read own", 0002) lets a client login read every task
 * on their client record, so nothing here is hidden by the filter that
 * wasn't already readable. Internal notes belong in the team thread,
 * which a client genuinely cannot read.
 *
 * Ticking is off: a client has no update policy on `tasks`, so a live
 * box would fail and snap back. They tell their team instead.
 */
export default async function PortalTodoPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .single();

  const clientId = (profile as { client_id?: string | null } | null)?.client_id;
  if (!clientId) redirect("/app/portal");

  const [{ data: tasks }, { data: client }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, text, due_date, done, client_id, assigned_to")
      .eq("client_id", clientId)
      .is("assigned_to", null)
      .order("due_date", { nullsFirst: false }),
    supabase.from("clients").select("next_action").eq("id", clientId).maybeSingle(),
  ]);

  const entries = (tasks ?? []) as unknown as TodoEntry[];
  const open = entries.filter((t) => !t.done);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = open.filter((t) => t.due_date && new Date(t.due_date) < today).length;

  const nextAction = (client as { next_action?: string | null } | null)?.next_action;

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">To-do</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 26px", maxWidth: "60ch" }}>
        Anything your team needs from you — things to send over, approve or
        decide on. Done something? Message your team and they&rsquo;ll tick it
        off.
      </p>

      {nextAction && (
        /* The single most important thing, lifted out of the list. It's
           the same "Next up" the Overview leads with, so the two pages
           never disagree about what's most pressing. */
        <section
          className="section"
          style={{
            padding: "20px 22px",
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-ring)",
            borderRadius: "var(--radius-md)",
            maxWidth: 600,
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--accent)",
              marginBottom: 10,
            }}
          >
            Next up
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 15.5, color: "var(--text-1)", lineHeight: 1.55 }}>
            {nextAction}
          </span>
        </section>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing outstanding"
          body="There's nothing your team is waiting on from you right now. Anything that comes up will land here."
        />
      ) : (
        <>
          <div className="stat-row">
            <StatTile label="Outstanding" value={String(open.length)} tone={open.length === 0 ? "ok" : "neutral"} />
            <StatTile
              label="Overdue"
              value={String(overdue)}
              tone={overdue > 0 ? "danger" : "ok"}
              hint={overdue > 0 ? "past the date agreed" : "nothing has slipped"}
            />
            <StatTile label="Done" value={String(entries.length - open.length)} hint="all time" />
          </div>

          <section className="section" style={{ maxWidth: 780 }}>
            {/* A client has no insert, update or delete policy on
                `tasks`, so both the add controls and the tick boxes
                are off — a live-looking box that silently snaps back
                is worse than one that plainly isn't yours to press. */}
            <TodoPanel
              initialTasks={entries}
              editable={false}
              canTick={false}
              showClientLink={false}
              emptyMessage="Nothing outstanding."
            />
          </section>
        </>
      )}
    </main>
  );
}
