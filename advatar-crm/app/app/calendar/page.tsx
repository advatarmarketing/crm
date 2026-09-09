import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SchedulePanel, type ScheduleEntry, type EventCategory, type ClientChoice } from "@/components/SchedulePanel";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AvailabilityPanel } from "@/components/AvailabilityPanel";
import { displayName } from "@/lib/names";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const MANAGEMENT: ProfileRole[] = ["ceo", "operations_manager"];

/**
 * One Calendar tab for every role.
 *
 * What changes between roles is not this page but what comes back from
 * it: `schedule_events`' RLS (0018, extended for clients in 0025)
 * decides whose bookings you can read, and whether an insert is
 * allowed. So the page fetches "the calendar" and Postgres narrows it.
 *
 * CEO and operations managers get the extra `?person=` selector, which
 * both filters the view and decides whose calendar a new entry lands
 * on (prompt 9) — booking a shoot for a videographer is a thing you do
 * from the diary, not from their profile.
 *
 * A wide window is fetched in one go (three months back, nine forward)
 * so paging between months is instant instead of a round trip a click.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { person?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, availability")
    .eq("id", user.id)
    .single();

  const me = profile as
    | { role?: ProfileRole; full_name?: string | null; availability?: string | null }
    | null;
  const role = me?.role;

  if (!role) redirect("/login");

  const isManagement = MANAGEMENT.includes(role);
  const selectedPerson = isManagement ? searchParams.person ?? "" : user.id;

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 9, 1);

  let eventQuery = supabase
    .from("schedule_events")
    .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
    .gte("starts_at", from.toISOString())
    .lt("starts_at", to.toISOString())
    .order("starts_at");

  // Staff and videographers see their own diary plus anything on a
  // client they're assigned to — that is RLS's job, not a filter here,
  // so only the management "whose calendar" choice narrows the query.
  if (isManagement && selectedPerson) {
    eventQuery = eventQuery.eq("assigned_to", selectedPerson);
  }

  const [{ data: events, error: eventsError }, { data: categories }, { data: clients }, { data: people }] =
    await Promise.all([
      eventQuery,
      supabase.from("event_categories").select("id, name, colour").order("position"),
      supabase.from("clients").select("id, name").order("name"),
      isManagement
        ? supabase.from("profiles").select("id, full_name, role").neq("role", "client").order("full_name")
        : Promise.resolve({ data: [] as unknown }),
    ]);

  const clientRows = (clients ?? []) as unknown as { id: string; name: string | null }[];
  const clientNameById = new Map(clientRows.map((c) => [c.id, c.name?.trim() || "Untitled client"]));

  const peopleRows = (people ?? []) as unknown as { id: string; full_name: string | null; role: string }[];
  const personList: Person[] = peopleRows.map((p) => ({
    id: p.id,
    name: displayName(p.full_name),
    role: p.role,
  }));
  const personNameById = new Map(personList.map((p) => [p.id, p.name]));

  const entries: ScheduleEntry[] = ((events ?? []) as unknown as ScheduleEntry[]).map((e) => ({
    ...e,
    clientName: e.client_id ? clientNameById.get(e.client_id) ?? null : null,
    personName: e.assigned_to ? personNameById.get(e.assigned_to) ?? null : null,
  }));

  // Only management books; everyone else is reading the diary that is
  // run for them. Clients are read-only in the database too (0025).
  const editable = isManagement;
  const showingEveryone = isManagement && !selectedPerson;
  const whose = selectedPerson && selectedPerson !== user.id ? personNameById.get(selectedPerson) : null;

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Calendar</h1>
        {isManagement && personList.length > 0 && (
          <PersonPicker people={personList} selected={selectedPerson} />
        )}
      </div>

      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px", maxWidth: "60ch" }}>
        {role === "client"
          ? "Shoot days and sessions booked in for you. Tap a day to see everything on it."
          : showingEveryone
            ? "Everything booked across the team. Pick a name above to see one person's diary — and to add entries straight to it."
            : whose
              ? `${whose}'s diary. Anything you add below lands on their calendar and they'll see it on theirs.`
              : "Your shoot days, edits, working time and joint sessions. Tap a day to see everything on it."}
      </p>

      {eventsError && (
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
          The calendar could not be loaded: {eventsError.message}
        </p>
      )}

      <MonthCalendar
        events={entries}
        categories={(categories ?? []) as unknown as EventCategory[]}
        showPerson={showingEveryone}
      />

      <section className="section" style={{ marginTop: 36 }}>
        <div className="section-head">
          <h2 className="section-title">
            {whose ? `Coming up for ${whose}` : showingEveryone ? "Coming up across the team" : "Coming up"}
          </h2>
        </div>

        <SchedulePanel
          initialEvents={entries.filter((e) => new Date(e.starts_at) >= startOfToday())}
          editable={editable}
          // With nobody picked an entry would have no owner, which is
          // how you end up with a shoot nobody thinks is theirs.
          defaultAssignee={isManagement ? selectedPerson || null : null}
          clients={clientRows.map((c) => ({ id: c.id, name: c.name?.trim() || "Untitled client" })) as ClientChoice[]}
          categories={(categories ?? []) as unknown as EventCategory[]}
          showPerson={showingEveryone}
          emptyMessage={
            editable ? "Nothing booked from today onwards." : "Nothing booked in from today onwards."
          }
        />

        {editable && !selectedPerson && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", marginTop: 10 }}>
            Pick a name above before adding, so the entry lands on someone&rsquo;s calendar.
          </p>
        )}
      </section>

      {/* Prompt 9: when this person is free, in their own words. Sits
          under the calendar because it is the other half of the same
          question — the grid says what is booked, this says what could
          be. Management reads it on their Videographers page when
          deciding who to put on a job.

          Clients don't get this: their availability isn't something
          the agency books against. */}
      {role !== "client" && (
        <section className="section" style={{ maxWidth: 780 }}>
          <div className="section-head">
            <h2 className="section-title">Your availability</h2>
            <p className="section-sub">The office sees this when they book you in</p>
          </div>
          <AvailabilityPanel
            profileId={user.id}
            initialValue={me?.availability ?? null}
            emptyMessage="You haven't written anything down yet. Whoever books your work has nothing to go on until you do."
          />
        </section>
      )}
    </main>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
