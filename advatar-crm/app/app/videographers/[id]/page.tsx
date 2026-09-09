import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SchedulePanel, type ScheduleEntry, type ClientChoice, type EventCategory } from "@/components/SchedulePanel";
import { TodoPanel, type TodoEntry } from "@/components/TodoPanel";
import { ResourcesPanel, type ResourceEntry } from "@/components/ResourcesPanel";
import { SubmissionsPanel } from "@/components/SubmissionsPanel";
import { loadSubmissions } from "@/lib/submissions";
import type { ProfileRole } from "@/lib/supabase/types";
import { displayName } from "@/lib/names";
import { ProfilePanel, type EditableProfile } from "@/components/ProfilePanel";

export const dynamic = "force-dynamic";

/**
 * One videographer, from the admin side: their schedule, their
 * to-dos, the clients they're on, and the SOPs/tutorials that apply
 * to them.
 *
 * This is the management view — what the videographer sees from their
 * own login is a separate piece of work. Everything written here goes
 * into tables the videographer's own RLS can already read (0018), so
 * that later view has real data waiting for it rather than needing a
 * second set of tables.
 */
export default async function VideographerDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const callerRole = (callerProfile as { role?: string } | null)?.role as ProfileRole | undefined;

  if (callerRole !== "ceo" && callerRole !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const { data: person } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url, phone")
    .eq("id", params.id)
    .maybeSingle();

  const videographer = person as
    | { id: string; full_name: string; role: string; avatar_url: string | null; phone: string | null }
    | null;

  if (!videographer || videographer.role !== "videographer") {
    notFound();
  }

  const [
    { data: events },
    { data: tasks },
    { data: resources },
    { data: assignments },
    { data: allClients },
    { data: categories },
    submissions,
  ] =
    await Promise.all([
      supabase
        .from("schedule_events")
        .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
        .eq("assigned_to", params.id)
        .order("starts_at"),
      supabase
        .from("tasks")
        .select("id, text, due_date, done, client_id, assigned_to")
        .eq("assigned_to", params.id)
        .order("due_date", { nullsFirst: false }),
      // Everything aimed at videographers generally, plus anything
      // pinned to this person specifically.
      supabase
        .from("resources")
        .select("id, title, kind, url, body, audience_role, assigned_to")
        .eq("audience_role", "videographer")
        .or(`assigned_to.is.null,assigned_to.eq.${params.id}`)
        .order("position"),
      supabase.from("client_staff").select("client_id").eq("staff_id", params.id),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("event_categories").select("id, name, colour").order("position"),
      loadSubmissions(supabase, { createdBy: params.id }),
    ]);

  const clients: ClientChoice[] = ((allClients ?? []) as unknown as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));

  const assignedClientIds = new Set(
    ((assignments ?? []) as unknown as { client_id: string }[]).map((a) => a.client_id)
  );
  const assignedClients = clients.filter((c) => assignedClientIds.has(c.id));

  const scheduleEntries: ScheduleEntry[] = ((events ?? []) as unknown as ScheduleEntry[]).map((e) => ({
    ...e,
    clientName: e.client_id ? clientNameById.get(e.client_id) ?? null : null,
  }));

  const todoEntries: TodoEntry[] = ((tasks ?? []) as unknown as TodoEntry[]).map((t) => ({
    ...t,
    clientName: t.client_id ? clientNameById.get(t.client_id) ?? null : null,
  }));

  // Checklist steps for the SOPs above, so the editor shows what is
  // already there rather than appearing empty every time.
  const resourceIds = ((resources ?? []) as unknown as { id: string }[]).map((r) => r.id);
  const { data: checklistItems } = resourceIds.length
    ? await supabase
        .from("resource_checklist_items")
        .select("id, resource_id, text, position")
        .in("resource_id", resourceIds)
        .order("position")
    : { data: [] };

  const stepsByResource = new Map<string, { id: string; text: string; position: number }[]>();
  for (const i of (checklistItems ?? []) as unknown as {
    id: string;
    resource_id: string;
    text: string;
    position: number;
  }[]) {
    if (!stepsByResource.has(i.resource_id)) stepsByResource.set(i.resource_id, []);
    stepsByResource.get(i.resource_id)!.push({ id: i.id, text: i.text, position: i.position });
  }

  const resourceEntries = ((resources ?? []) as unknown as ResourceEntry[]).map((r) => ({
    ...r,
    steps: stepsByResource.get(r.id) ?? [],
  }));

  const name = displayName(videographer.full_name);

  return (
    <main className="page">
      <Link
        href="/app/videographers"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          textDecoration: "none",
        }}
      >
        ← Videographers
      </Link>

      <h1 className="page-title page-title-accent" style={{ margin: "14px 0 0" }}>
        {name}
      </h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", margin: "0 0 32px" }}>
        Videographer
        {assignedClients.length > 0 && ` · ${assignedClients.map((c) => c.name).join(", ")}`}
      </p>

      {/* Their details, editable here: 0022 lets management update any
          profile, so the CEO can add a photo or phone number on
          somebody's behalf rather than waiting for them to do it. */}
      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">Details</h2>
          <p className="section-sub">Name, phone and photo</p>
        </div>
        <ProfilePanel profile={videographer as unknown as EditableProfile} />
      </section>

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">Schedule</h2>
          <p className="section-sub">Shoots, calls and deadlines in their diary</p>
        </div>
        <SchedulePanel
          initialEvents={scheduleEntries}
          editable
          defaultAssignee={params.id}
          clients={clients}
          categories={(categories ?? []) as unknown as EventCategory[]}
          emptyMessage="Nothing in their schedule yet."
        />
      </section>

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">Tasks &amp; to-do list</h2>
          <p className="section-sub">Assigned to them — they see these from their own login too</p>
        </div>
        <TodoPanel
          initialTasks={todoEntries}
          editable
          defaultAssignee={params.id}
          clients={clients}
          emptyMessage="Nothing assigned to them right now."
        />
      </section>

      <section className="section" style={{ maxWidth: 820 }}>
        <div className="section-head">
          <h2 className="section-title">Video submissions</h2>
          <p className="section-sub">Their work, and where each round sits</p>
        </div>
        {/* canReview: move the status on and leave feedback. The
            videographer cannot do either — they have no update policy
            on submissions and no insert on feedback (0020). */}
        <SubmissionsPanel
          initialSubmissions={submissions}
          canReview
          currentUserId={user.id}
          clients={clients}
          emptyMessage="They haven't submitted any work yet."
        />
      </section>

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head">
          <h2 className="section-title">SOPs &amp; tutorials</h2>
          <p className="section-sub">
            Add steps to any SOP and it becomes a checklist on their Guidelines tab
          </p>
        </div>
        <ResourcesPanel
          initialResources={resourceEntries}
          editable
          audienceRole="videographer"
          personId={params.id}
          personName={name}
          emptyMessage="No SOPs or tutorials added yet."
        />
      </section>

      <section className="section" style={{ maxWidth: 780 }}>
        <div className="section-head"><h2 className="section-title">Assigned clients</h2></div>
        {assignedClients.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            Not assigned to any clients yet — you assign people from a client's
            own page, under Assigned team.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {assignedClients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/clients/${c.id}`}
                  style={{
                    display: "inline-block",
                    fontFamily: "var(--font-body)",
                    fontSize: 13.5,
                    color: "var(--text-1)",
                    textDecoration: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    background: "var(--surface)",
                  }}
                >
                  {c.name} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

const sectionHeading = {
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
