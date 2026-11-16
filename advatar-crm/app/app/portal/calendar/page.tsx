import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MonthCalendar, type CalendarMarker } from "@/components/MonthCalendar";
import { STAGE_LABEL, loadVideos, todayKey, videoLabel, videoStage } from "@/lib/videos";
import { loadClientAccount, paymentDates } from "@/lib/account";
import { SchedulePanel, type ScheduleEntry, type EventCategory } from "@/components/SchedulePanel";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

/**
 * What the client has booked in with us.
 *
 * Read-only, and read-only in the database too: `schedule_events`
 * gives a client login select on entries attached to their own client
 * record and nothing else (0025). The diary is run by the agency, so
 * there is nothing here to edit — a booking a client could move is a
 * booking a videographer turns up for on the wrong day.
 *
 * A wide window is fetched at once (three months back, nine forward)
 * so paging between months is instant.
 */
export default async function PortalCalendarPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 9, 1);

  const [{ data: events }, { data: categories }] = await Promise.all([
    supabase
      .from("schedule_events")
      .select("id, title, starts_at, ends_at, all_day, location, category_id, client_id, assigned_to")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at"),
    supabase.from("event_categories").select("id, name, colour").order("position"),
  ]);

  const entries = (events ?? []) as unknown as ScheduleEntry[];

  // 0042: every video going out for them, planned or not — "something
  // goes out that day" even before anything is filmed. RLS returns
  // only their own; before the migration this is simply empty.
  const { videos, uploads } = await loadVideos(supabase, { from: todayKey(from), to: todayKey(to) });
  const markers: CalendarMarker[] = videos
    .filter((v) => v.publish_on)
    .map((v) => {
      const stage = videoStage(v, v.submission_id ? uploads.get(v.submission_id) : null);
      return {
        id: v.id,
        date: v.publish_on!,
        kind: "video" as const,
        title: videoLabel(v),
        detail: [v.title && v.pillar ? v.pillar : null, STAGE_LABEL[stage].client].filter(Boolean).join(" · "),
        href: stage === "planned" || stage === "editing" ? null : `/app/portal/videos#video-${v.id}`,
      };
    });
  // 0043: payment due dates, so "when do I pay" is on the same page as
  // "when is my shoot". Only their own; nothing before the migration.
  const { data: me } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle();
  const myClientId = (me as { client_id?: string | null } | null)?.client_id ?? null;
  if (myClientId) {
    const account = await loadClientAccount(supabase, myClientId);
    for (const p of paymentDates(account, todayKey(from), todayKey(to))) {
      markers.push({
        id: `pay-${p.date}`,
        date: p.date,
        kind: "payment",
        title: p.overdue ? "Payment overdue" : "Payment due",
        detail: p.label,
        href: "/app/portal/account",
        alert: p.overdue,
      });
    }
  }
  const todayIso = todayKey();
  const nextVideo = markers.filter((m) => m.kind === "video" && m.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date))[0];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const upcoming = entries.filter((e) => new Date(e.starts_at) >= startOfToday);

  const weekEnd = new Date(startOfToday);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeek = upcoming.filter((e) => new Date(e.starts_at) < weekEnd);
  const next = upcoming[0];

  return (
    <main className="page">
      <h1 className="page-title page-title-accent">Calendar</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 26px", maxWidth: "60ch" }}>
        Your shoot days, sessions and every video going out (▶). Tap a day to
        see everything on it. If something needs moving, message your team and they&rsquo;ll
        rearrange it.
      </p>

      {entries.length === 0 && markers.length === 0 ? (
        <EmptyState
          title="Nothing booked in yet"
          body="Once your team schedules a shoot or a session, it appears here — and you'll get a notification when it's set."
        />
      ) : (
        <>
          <div className="stat-row">
            <StatTile
              label="Next up"
              value={
                next
                  ? new Date(next.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : "—"
              }
              tone={next ? "accent" : "neutral"}
              hint={next?.title ?? "nothing scheduled"}
            />
            {markers.some((m) => m.kind === "video") && (
              <StatTile
                label="Next video out"
                value={nextVideo ? new Date(`${nextVideo.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "—"}
                tone={nextVideo ? "accent" : "neutral"}
                hint={nextVideo?.title ?? "none scheduled"}
              />
            )}
            <StatTile label="This week" value={String(thisWeek.length)} hint="bookings, next seven days" />
            <StatTile label="Coming up" value={String(upcoming.length)} hint="from today onwards" />
          </div>

          <MonthCalendar
            events={entries}
            categories={(categories ?? []) as unknown as EventCategory[]}
            markers={markers}
            videoToggle={markers.some((m) => m.kind === "video")}
          />

          <section className="section" style={{ marginTop: 36, maxWidth: 780 }}>
            <div className="section-head">
              <h2 className="section-title">Coming up</h2>
              <p className="section-sub">Soonest first</p>
            </div>
            <SchedulePanel
              initialEvents={upcoming}
              categories={(categories ?? []) as unknown as EventCategory[]}
              emptyMessage="Nothing booked in from today onwards."
            />
          </section>
        </>
      )}
    </main>
  );
}
