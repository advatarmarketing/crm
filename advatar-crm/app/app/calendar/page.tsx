import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonthCalendar, type CalendarMarker } from "@/components/MonthCalendar";
import { STAGE_LABEL, loadVideos, todayKey, videoLabel, videoStage } from "@/lib/videos";
import { moveVideoOnCalendar } from "@/app/app/videos/actions";
import { SchedulePanel, type ScheduleEntry, type EventCategory, type ClientChoice } from "@/components/SchedulePanel";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AvailabilityPanel } from "@/components/AvailabilityPanel";
import { AddCalendarEntryButton } from "@/components/AddCalendarEntryButton";
import { displayName } from "@/lib/names";
import { loadAvailability } from "@/lib/availability";
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
  searchParams: { person?: string; client?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Only the columns this page cannot work without. `availability` is
  // read separately below: selecting it here once took the whole page
  // down on a database where 0026 hadn't been run, because PostgREST
  // fails the entire query over one unknown column.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const me = profile as { role?: ProfileRole; full_name?: string | null } | null;
  const role = me?.role;

  // A failed query is not the same as being signed out, and must not
  // look like it. middleware.ts has already read this profile's role
  // to let the request through, so if the read fails here it is a
  // database problem — say so, rather than bouncing to a login screen
  // the person is already past.
  if (!role) {
    return (
      <main className="page">
        <h1 className="page-title page-title-accent">Calendar</h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--danger-fg)",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-sm)",
            padding: "14px 16px",
            maxWidth: "62ch",
            lineHeight: 1.6,
          }}
        >
          Your profile couldn&rsquo;t be loaded, so this page doesn&rsquo;t know
          which calendar to show you.
          {profileError?.message ? ` The database said: ${profileError.message}` : ""}
        </p>
      </main>
    );
  }

  const isManagement = MANAGEMENT.includes(role);
  const selectedPerson = isManagement ? searchParams.person ?? "" : user.id;

  // A separate axis from "whose diary". A shoot belongs to a person
  // AND a client, and the two questions you ask of a calendar are
  // "what is Sam doing" and "what is booked in for Bright Co" — so
  // they get a picker each rather than one list mixing people and
  // clients together. Set both and they narrow to the intersection.
  const selectedClient = isManagement ? searchParams.client ?? "" : "";

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
  if (isManagement && selectedClient) {
    eventQuery = eventQuery.eq("client_id", selectedClient);
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

  // 0042: every video going out, across every client this person can
  // see (RLS narrows it). Its own query, so before the migration runs
  // the calendar simply has no videos on it.
  const dayKeyOf = (d: Date) => todayKey(d);
  const videoData = role === "client" ? null : await loadVideos(supabase, { from: dayKeyOf(from), to: dayKeyOf(to) });
  let personClients: Set<string> | null = null;
  if (isManagement && selectedPerson && !selectedClient) {
    const { data: links } = await supabase.from("client_staff").select("client_id").eq("staff_id", selectedPerson);
    personClients = new Set(((links ?? []) as { client_id: string }[]).map((l) => l.client_id));
  }
  const canMoveVideos = isManagement || role === "staff";

  // Separate, and its failure is survivable — see lib/availability.ts.
  const availability = role === "client" ? { value: null, columnMissing: false } : await loadAvailability(supabase, user.id);

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
  const showingEveryone = isManagement && !selectedPerson && !selectedClient;
  const whose = selectedPerson && selectedPerson !== user.id ? personNameById.get(selectedPerson) : null;
  const whichClient = selectedClient ? clientNameById.get(selectedClient) ?? "that client" : null;

  const today = todayKey();
  const markers: CalendarMarker[] = (videoData?.videos ?? [])
    .filter((v) => v.publish_on)
    .filter((v) => !selectedClient || v.client_id === selectedClient)
    .filter((v) => !personClients || personClients.has(v.client_id))
    .map((v) => {
      const stage = videoStage(v, v.submission_id ? videoData!.uploads.get(v.submission_id) : null);
      const late = stage === "planned" && v.publish_on! < today;
      const clientName = clientNameById.get(v.client_id) ?? "Client";
      return {
        id: v.id,
        date: v.publish_on!,
        kind: "video" as const,
        title: selectedClient ? videoLabel(v) : `${clientName}: ${videoLabel(v)}`,
        detail: [clientName, v.pillar, late ? "Late — nothing uploaded" : STAGE_LABEL[stage].team].filter(Boolean).join(" · "),
        href: `/app/clients/${v.client_id}?tab=videos`,
        movable: canMoveVideos && !v.posted_at,
        alert: late,
      };
    });

  // Payments due, for management only — invoices are theirs under RLS
  // (0011/0029) and nobody else should see money on a calendar.
  if (isManagement) {
    const { data: due } = await supabase
      .from("invoices")
      .select("id, client_id, number, amount, due_date, status")
      .eq("status", "sent")
      .gte("due_date", dayKeyOf(from))
      .lt("due_date", dayKeyOf(to));
    for (const inv of (due ?? []) as { id: string; client_id: string; number: string | null; amount: number | null; due_date: string }[]) {
      if (selectedClient && inv.client_id !== selectedClient) continue;
      if (personClients && !personClients.has(inv.client_id)) continue;
      const late = inv.due_date < today;
      markers.push({
        id: `inv-${inv.id}`,
        date: inv.due_date,
        kind: "payment",
        title: `${clientNameById.get(inv.client_id) ?? "Client"}: payment ${late ? "overdue" : "due"}`,
        detail: [inv.number ? `Invoice ${inv.number}` : "Invoice", inv.amount !== null ? `£${Number(inv.amount).toLocaleString("en-GB")}` : null].filter(Boolean).join(" · "),
        href: `/app/finance`,
        alert: late,
      });
    }
  }

  const clientChoices: Person[] = clientRows.map((c) => ({
    id: c.id,
    name: c.name?.trim() || "Untitled client",
    // No role: PersonPicker then renders one flat list rather than
    // grouping every client under a "client" heading.
    role: "",
  }));

  // An entry needs an owner: a person, a client, or both. Only with
  // neither would it be a booking nobody can find.
  const canAdd = Boolean(selectedPerson || selectedClient);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Calendar</h1>
        {isManagement && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {/* The quick way in. The form itself is SchedulePanel's,
                further down — this opens it and scrolls to it, so
                adding something does not mean hunting for the bottom
                of the page first. */}
            <AddCalendarEntryButton
              disabledReason={
                canAdd
                  ? undefined
                  : "Pick a person or a client first, so the entry lands on a calendar somebody looks at"
              }
            />
            {personList.length > 0 && (
              <PersonPicker people={personList} selected={selectedPerson} />
            )}
            {clientChoices.length > 0 && (
              <PersonPicker
                people={clientChoices}
                selected={selectedClient}
                param="client"
                label="Which client"
                allLabel="All clients"
              />
            )}
          </div>
        )}
      </div>

      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px", maxWidth: "60ch" }}>
        {role === "client"
          ? "Shoot days and sessions booked in for you. Tap a day to see everything on it."
          : showingEveryone
            ? "Everything booked across the team. Narrow it to one person's diary or one client's — and add entries straight to either."
            : whose && whichClient
              ? `${whose}'s work on ${whichClient}. Anything you add lands on both.`
              : whichClient
                ? `Everything booked in for ${whichClient}, whoever is on it. Add an entry below and it lands on their calendar — they can see it from their own login.`
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
        markers={markers}
        videoToggle={role !== "client"}
        onMoveMarker={canMoveVideos ? moveVideoOnCalendar : undefined}
      />

      <section className="section" style={{ marginTop: 36 }}>
        <div className="section-head">
          <h2 className="section-title">
            {whose && whichClient
              ? `Coming up for ${whose} on ${whichClient}`
              : whichClient
                ? `Coming up for ${whichClient}`
                : whose
                  ? `Coming up for ${whose}`
                  : showingEveryone
                    ? "Coming up across the team"
                    : "Coming up"}
          </h2>
        </div>

        <SchedulePanel
          initialEvents={entries.filter((e) => new Date(e.starts_at) >= startOfToday())}
          editable={editable}
          // With nobody picked an entry would have no owner, which is
          // how you end up with a shoot nobody thinks is theirs.
          defaultAssignee={isManagement ? selectedPerson || null : null}
          defaultClient={isManagement ? selectedClient || null : null}
          clients={clientRows.map((c) => ({ id: c.id, name: c.name?.trim() || "Untitled client" })) as ClientChoice[]}
          categories={(categories ?? []) as unknown as EventCategory[]}
          showPerson={showingEveryone}
          emptyMessage={
            editable ? "Nothing booked from today onwards." : "Nothing booked in from today onwards."
          }
        />

        {editable && !canAdd && (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", marginTop: 10 }}>
            Pick a person or a client above before adding, so the entry lands on
            a calendar somebody actually looks at.
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
          {availability.columnMissing ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
              Availability isn&rsquo;t switched on yet — migration 0026 still
              needs running. Everything else on this page works as normal.
            </p>
          ) : (
            <AvailabilityPanel
              profileId={user.id}
              initialValue={availability.value}
              emptyMessage="You haven't written anything down yet. Whoever books your work has nothing to go on until you do."
            />
          )}
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
