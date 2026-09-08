import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventCategoriesEditor } from "@/components/EventCategoriesEditor";
import type { EventCategory } from "@/components/SchedulePanel";
import type { ProfileRole } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * The calendar's event types and their colours.
 *
 * Open to staff as well as management, which is what was asked for —
 * the people booking shoots are the ones who know what needs a
 * category. Videographers read the list (their calendar needs the
 * names and colours) but can't change it, since renaming a category
 * changes it on everybody's calendar at once.
 */
export default async function EventCategoriesPage() {
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

  const role = (profile as { role?: string } | null)?.role as ProfileRole | undefined;

  if (role !== "ceo" && role !== "operations_manager" && role !== "staff") {
    redirect("/app/dashboard");
  }

  const { data: categories } = await supabase
    .from("event_categories")
    .select("id, name, colour")
    .order("position");

  return (
    <main className="page page-xs">
      <Link
        href="/app/dashboard"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          textDecoration: "none",
        }}
      >
        ← Dashboard
      </Link>

      <h1 className="page-title page-title-accent" style={{ margin: "12px 0 4px" }}>
        Event categories
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-2)", margin: "0 0 32px", lineHeight: 1.6 }}>
        The types of entry that can go on the calendar, and the colour each one
        shows in. Rename them, change the colours, add your own — everyone's
        calendar updates to match.
      </p>

      <EventCategoriesEditor initialCategories={(categories ?? []) as unknown as EventCategory[]} />
    </main>
  );
}
