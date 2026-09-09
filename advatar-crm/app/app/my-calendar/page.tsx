import { redirect } from "next/navigation";

/**
 * The videographer's calendar moved to /app/calendar, which every role
 * now shares (prompt 8). Kept as a redirect rather than deleted: this
 * was in the nav for several weeks and people bookmark the tab they
 * live in.
 */
export default function MyCalendarPage() {
  redirect("/app/calendar");
}
