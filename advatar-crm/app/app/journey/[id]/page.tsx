import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JourneyView } from "@/components/journey/JourneyView";
import { loadJourney, loadMinimums } from "@/lib/journey";

export const dynamic = "force-dynamic";

/** One person's journey, for the CEO and operations managers: sign steps off, move them up. */
export default async function PersonJourneyPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "ceo" && role !== "operations_manager") redirect("/app/journey");
  const { data: person } = await supabase.from("profiles").select("id, full_name, role").eq("id", params.id).maybeSingle();
  const p = person as { id: string; full_name: string | null; role: string } | null;
  if (!p || p.role === "client" || p.role === "ceo") notFound();
  const data = await loadJourney(supabase, p.id, p.full_name?.trim() || "Them");
  // The CEO's private marker: read and passed on only for the CEO.
  const markerLevel = role === "ceo" && data.path ? (await loadMinimums(supabase)).get(data.path.id) ?? null : null;
  return (
    <main className="page">
      <p style={{ margin: "0 0 12px" }}>
        <Link href="/app/journey/team">← Team journeys</Link>
      </p>
      <JourneyView data={data} mode="manage" marker={markerLevel ? { levelId: markerLevel, label: "Minimum level (only you see this)" } : undefined} />
    </main>
  );
}
