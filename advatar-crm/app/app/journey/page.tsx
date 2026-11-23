import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JourneyView } from "@/components/journey/JourneyView";
import { loadJourney } from "@/lib/journey";

export const dynamic = "force-dynamic";

/** Your Journey: your own path. The CEO has no path of their own and lands on Team journeys. */
export default async function JourneyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  const profile = me as { role?: string; full_name?: string | null } | null;
  if (!profile?.role || profile.role === "client") redirect("/login");
  if (profile.role === "ceo") redirect("/app/journey/team");
  const data = await loadJourney(supabase, user.id, profile.full_name?.trim() || "You");
  return (
    <main className="page">
      <JourneyView data={data} mode="self" />
    </main>
  );
}
