import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonthCalendar } from "@/components/MonthCalendar";
import type { ScheduleEntry, EventCategory } from "@/components/SchedulePanel";

export const dynamic = "force-dynamic";

/**
 * The videographer's own calendar — a month at a time, colour-coded
 * by the categories staff manage (0019).
 *
 * Read-only, matching their RLS: they see their own bookings and
 * anything on a client they're assigned to, and booking is done from
 * the admin side.
 *
 * A generous window is fetched in one go (three months back, nine
 * forward) so paging between months is instant rather than a round
 * trip per click — a year of one person's shoots is a small number of
 * rows.
 */
export default async function MyCalendarPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 9, 1);

  const [{ data: events }, { data: categories }, { data: clients }] = await Promise.all([
    supabase
      .from("schedule_events")
      .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at"),
    supabase.from("event_categories").select("id, name, colour").order("position"),
    supabase.from("clients").select("id, name"),
  ]);

  const clientNameById = new Map(
    ((clients ?? []) as unknown as { id: string; name: string }[]).map((c) => [c.id, c.name])
  );

  const entries: ScheduleEntry[] = ((events ?? []) as unknown as ScheduleEntry[]).map((e) => ({
    ...e,
    clientName: e.client_id ? clientNameById.get(e.client_id) ?? null : null,
  }));

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">Calendar</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        Your shoot days, edits, working time and joint sessions. Tap a day to see
        everything on it.
      </p>

      <MonthCalendar
        events={entries}
        categories={(categories ?? []) as unknown as EventCategory[]}
      />
    </main>
  );
}
