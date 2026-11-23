import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JourneyEditor } from "@/components/journey/JourneyEditor";
import { loadMinimums, loadPaths } from "@/lib/journey";

export const dynamic = "force-dynamic";

/** CEO only: every path, level, range and checklist, plus the private minimum marker. */
export default async function EditJourneysPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role?: string } | null)?.role !== "ceo") redirect("/app/journey");
  const [{ available, paths }, minimums] = await Promise.all([loadPaths(supabase), loadMinimums(supabase)]);
  return (
    <main className="page page-sm">
      <p style={{ margin: "0 0 12px" }}>
        <Link href="/app/journey/team">← Team journeys</Link>
      </p>
      <h1 className="page-title page-title-accent">Edit the paths</h1>
      <p className="you-intro">
        Everything here is a placeholder until you change it. Earnings are always shown to the team as a range. The minimum level marker is
        only ever visible to you.
      </p>
      {available ? (
        <JourneyEditor paths={paths} minimums={Object.fromEntries(minimums)} />
      ) : (
        <p className="access-note">Run database update 0055 in Supabase first.</p>
      )}
    </main>
  );
}
