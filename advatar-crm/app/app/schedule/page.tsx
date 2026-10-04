import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addDays, isoDate, loadWeekbook, startOfWeek } from "@/lib/planner-week";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";
import { EmptyState } from "@/components/EmptyState";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Who may write to the company diary (0018). */
const CAN_SHARE: ProfileRole[] = ["ceo", "operations_manager", "staff"];

/**
 * The Schedule tab: your own week, planned by the hour.
 *
 * Private to you. Both tables behind it are owner-only (0036), so
 * there is no management view of somebody's week and nothing here
 * differs by role — except whether the "also show this on the team
 * calendar" tick appears at all, which depends on whether this person
 * can write to schedule_events. A videographer reads the company
 * diary but cannot add to it, so for them the tick would be a button
 * that always failed.
 */
export default async function SchedulePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile as { role?: ProfileRole } | null)?.role;

  // The week is decided here, on the server, so the first paint has
  // one. The client fixes "today" after mount, because this server
  // runs on UTC and would otherwise light the wrong column for anyone
  // looking late on a British summer evening.
  const monday = startOfWeek(new Date());
  const book = await loadWeekbook(supabase, isoDate(monday), isoDate(addDays(monday, 6)));

  return (
    <main className="page page-lg">
      <h1 className="page-title page-title-accent">Schedule</h1>

      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--text-2)",
          margin: "0 0 22px",
          maxWidth: "64ch",
          lineHeight: 1.6,
        }}
      >
        Your week, hour by hour. Private to you — nobody else can see it,
        management included. Tap an hour to put something in, tick
        &ldquo;every week&rdquo; for the things that always happen, and save the
        ones you use often so they go back in with a tap.
        {role && CAN_SHARE.includes(role) && (
          <> Anything the team needs to know about, tick onto the team calendar.</>
        )}
      </p>

      {book.available ? (
        <ScheduleWorkspace
          initial={book}
          initialWeek={isoDate(monday)}
          canShare={Boolean(role && CAN_SHARE.includes(role))}
          myId={user.id}
        />
      ) : (
        <EmptyState
          title="Schedule isn’t switched on yet"
          body="This needs one database update (migration 0036) before a week can be saved. Nothing has been lost — there is nothing here yet to lose."
        />
      )}
    </main>
  );
}
