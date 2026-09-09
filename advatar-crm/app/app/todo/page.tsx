import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { StatTile } from "@/components/StatTile";
import { displayName, firstName } from "@/lib/names";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const MANAGEMENT: ProfileRole[] = ["ceo", "operations_manager"];

/** "all" rather than an empty parameter: this page defaults to *you*,
 *  so "everyone" has to be a state you can navigate back to. */
const EVERYONE = "all";

/**
 * One To-Do tab for every role.
 *
 * A to-do is a `tasks` row — the same table the client pages and both
 * dashboards already read — so anything added here appears against
 * that client too, rather than in a second private list that nobody
 * else can see.
 *
 * CEO and operations managers can switch to somebody else's list and
 * add to it (prompt 9); everyone else gets their own. As everywhere in
 * this app the limit is enforced by `tasks`' RLS, not by this page.
 */
export default async function TodoPage({ searchParams }: { searchParams: { person?: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const me = profile as { role?: ProfileRole; full_name?: string | null } | null;
  const role = me?.role;

  if (!role) redirect("/login");

  const isManagement = MANAGEMENT.includes(role);
  const selectedPerson = isManagement ? searchParams.person ?? user.id : user.id;
  const everyone = selectedPerson === EVERYONE;

  let taskQuery = supabase
    .from("tasks")
    .select("id, text, due_date, done, client_id, assigned_to")
    .order("due_date", { nullsFirst: false });

  if (!everyone) {
    taskQuery = taskQuery.eq("assigned_to", selectedPerson);
  }

  const [{ data: tasks, error: tasksError }, { data: clients }, { data: people }] = await Promise.all([
    taskQuery,
    supabase.from("clients").select("id, name").order("name"),
    isManagement
      ? supabase.from("profiles").select("id, full_name, role").neq("role", "client").order("full_name")
      : Promise.resolve({ data: [] as unknown }),
  ]);

  const clientRows = (clients ?? []) as unknown as { id: string; name: string | null }[];
  const clientChoices = clientRows.map((c) => ({ id: c.id, name: c.name?.trim() || "Untitled client" }));
  const clientNameById = new Map(clientChoices.map((c) => [c.id, c.name]));

  const peopleRows = (people ?? []) as unknown as { id: string; full_name: string | null; role: string }[];
  const personList: Person[] = peopleRows.map((p) => ({
    id: p.id,
    name: displayName(p.full_name),
    role: p.role,
  }));
  const personNameById = new Map(personList.map((p) => [p.id, p.name]));

  const entries: TodoEntry[] = ((tasks ?? []) as unknown as TodoEntry[]).map((t) => ({
    ...t,
    clientName: t.client_id ? clientNameById.get(t.client_id) ?? null : null,
    personName: t.assigned_to ? personNameById.get(t.assigned_to) ?? null : null,
  }));

  const open = entries.filter((t) => !t.done);
  const today = startOfToday();
  const overdue = open.filter((t) => t.due_date && new Date(t.due_date) < today).length;
  const dueToday = open.filter((t) => t.due_date && sameDay(new Date(t.due_date), today)).length;

  const lookingAtSomeoneElse = !everyone && selectedPerson !== user.id;
  const whose = lookingAtSomeoneElse ? personNameById.get(selectedPerson) ?? "them" : null;

  // Clients and staff can only link through to a client page that
  // exists for them; a videographer's is /app/my-clients.
  const showClientLink = role !== "videographer" && role !== "client";

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent">To-do</h1>
        {isManagement && personList.length > 0 && (
          <PersonPicker
            people={personList}
            selected={selectedPerson}
            label="Whose list"
            allLabel="Everyone"
            allValue={EVERYONE}
          />
        )}
      </div>

      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 24px", maxWidth: "60ch" }}>
        {everyone
          ? "Every open job across the team. Pick a name above to work on one person's list."
          : whose
            ? `${whose}'s list. Anything you add lands on their to-dos and they are told about it.`
            : `Everything on your plate, ${firstName(me?.full_name ?? null)}. Ticking something here ticks it wherever else it appears.`}
      </p>

      {tasksError && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--danger-fg)",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            margin: "0 0 20px",
          }}
        >
          The to-do list could not be loaded: {tasksError.message}
        </p>
      )}

      <div className="dashboard-widgets" style={{ marginBottom: 28 }}>
        <StatTile label="Open" value={String(open.length)} tone={open.length === 0 ? "ok" : "neutral"} />
        <StatTile
          label="Overdue"
          value={String(overdue)}
          tone={overdue > 0 ? "danger" : "ok"}
          hint={overdue > 0 ? "Past their due date" : "Nothing has slipped"}
        />
        <StatTile label="Due today" value={String(dueToday)} tone={dueToday > 0 ? "warn" : "neutral"} />
      </div>

      <section className="section">
        <TodoPanel
          initialTasks={entries}
          // Adding with nobody picked would leave the task unassigned,
          // which is how work quietly becomes nobody's.
          editable={!everyone}
          defaultAssignee={everyone ? null : selectedPerson}
          clients={clientChoices}
          showPerson={everyone}
          showClientLink={showClientLink}
          emptyMessage={
            everyone ? "Nothing outstanding anywhere. " : whose ? `${whose} has nothing outstanding.` : "Nothing outstanding. Enjoy it."
          }
        />

        {everyone && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", marginTop: 12 }}>
            Pick a name above to add or tick things off.
          </p>
        )}
      </section>
    </main>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
