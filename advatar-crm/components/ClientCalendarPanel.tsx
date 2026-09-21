"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SchedulePanel, type EventCategory, type ScheduleEntry } from "@/components/SchedulePanel";

/**
 * One client's diary, on their own record.
 *
 * This is the same calendar the client sees in their portal, shown
 * where the work is planned rather than only where it is read. It
 * replaces the shooting schedule that used to sit in the content
 * plan: that was prose about weeks, typed by hand and immediately out
 * of date. A shoot date belongs somewhere it can be booked, moved and
 * turned into a notification.
 *
 * Data is fetched here rather than on the page, and only when the tab
 * is opened — the same arrangement PlannerDocument uses, and for the
 * same reason: most visits to a client record never open this tab,
 * and two queries on every page load to serve the few that do is a
 * poor trade.
 *
 * `editable` renders the add/remove controls; `schedule_events`' RLS
 * (0018, rescoped in 0029) decides whether the write is actually
 * allowed. An operations manager gets it on their own clients, the
 * CEO everywhere, and a failed insert surfaces the database's own
 * message rather than being second-guessed here.
 *
 * A wide window is loaded at once — three months back, nine forward —
 * so paging between months never waits on the network. Same span the
 * client's own calendar uses.
 */
export function ClientCalendarPanel({
  clientId,
  editable = true,
}: {
  clientId: string;
  editable?: boolean;
}) {
  const [events, setEvents] = useState<ScheduleEntry[] | null>(null);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 9, 1);

      const [{ data: rows, error: eventsError }, { data: cats }] = await Promise.all([
        supabase
          .from("schedule_events")
          .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
          .eq("client_id", clientId)
          .gte("starts_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .order("starts_at"),
        supabase.from("event_categories").select("id, name, colour").order("position"),
      ]);

      if (cancelled) return;

      if (eventsError) {
        setError(eventsError.message);
        setEvents([]);
        return;
      }

      setEvents((rows ?? []) as unknown as ScheduleEntry[]);
      setCategories((cats ?? []) as unknown as EventCategory[]);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (events === null) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
        Loading the calendar…
      </p>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = events.filter((e) => new Date(e.starts_at) >= startOfToday);

  return (
    <div style={{ maxWidth: 900 }}>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--text-2)",
          margin: "0 0 20px",
          maxWidth: "62ch",
        }}
      >
        Shoot days, sessions and deadlines for this client. This is the same
        calendar they see in their portal, so anything booked here is visible to
        them straight away.{" "}
        {editable
          ? "Anything added here is attached to this client. To put it on a particular videographer's schedule as well, add it from the Calendar tab instead."
          : ""}
      </p>

      {error && (
        <p style={{ color: "var(--status-closed)", fontFamily: "var(--font-body)", fontSize: 13 }}>
          {error}
        </p>
      )}

      <MonthCalendar events={events} categories={categories} />

      <section style={{ marginTop: 36 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 14px" }}>
          Coming up
        </h2>
        <SchedulePanel
          initialEvents={upcoming}
          editable={editable}
          // Fixed, not picked: you are looking at one client's
          // calendar, so an entry added here belongs to them. With no
          // `clients` list passed, SchedulePanel leaves the picker out
          // entirely rather than showing a one-option dropdown.
          defaultClient={clientId}
          categories={categories}
          emptyMessage={
            editable
              ? "Nothing booked from today onwards."
              : "Nothing booked in from today onwards."
          }
        />
      </section>
    </div>
  );
}
