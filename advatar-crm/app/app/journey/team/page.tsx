import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TeamJourneys } from "@/components/journey/TeamJourneys";
import { loadPaths, loadTeamJourneys } from "@/lib/journey";

export const dynamic = "force-dynamic";

/** Everyone's path and level, for the CEO and operations managers. */
export default async function TeamJourneysPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "ceo" && role !== "operations_manager") redirect("/app/journey");
  const [{ available, paths }, rows] = await Promise.all([loadPaths(supabase), loadTeamJourneys(supabase)]);
  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Team journeys</h1>
        {role === "ceo" && available && (
          <Link href="/app/journey/edit" className="btn">
            Edit the paths
          </Link>
        )}
      </div>
      <p className="you-intro">
        Where everyone is on their path and what&rsquo;s next. Put each person on a path, then open them to sign off steps and move them up.
      </p>
      {available ? <TeamJourneys rows={rows} paths={paths} /> : <p className="access-note">Your Journey starts once database update 0055 has been run in Supabase.</p>}
    </main>
  );
}
