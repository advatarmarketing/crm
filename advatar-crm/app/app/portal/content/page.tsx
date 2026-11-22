import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadDashboard } from "@/lib/social/dashboard";
import { parseRange } from "@/lib/social";
import { SocialDashboard } from "@/components/social/SocialDashboard";

export const dynamic = "force-dynamic";

/**
 * Content Hub: how the client's social media is doing.
 *
 * Followers, likes, comments, posts and their best videos on Facebook,
 * Instagram, TikTok, YouTube, LinkedIn and X, read from the public
 * profiles the team linked, every day at 5pm (scraper/ in the
 * repository), and only for the platforms we post on for this client.
 */
export default async function PortalContentHubPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).single();
  if (!profile?.client_id) return null; // see PortalLayout

  const range = parseRange(searchParams.range);
  const data = await loadDashboard(supabase, profile.client_id, range);

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 6px" }}>Content Hub</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-2)", margin: "0 0 22px", maxWidth: "60ch", lineHeight: 1.6 }}>
        How your social media is performing, updated every day.
      </p>
      <SocialDashboard
        data={data}
        clientId={profile.client_id}
        audience="client"
        basePath="/app/portal/content"
        range={range}
      />
    </main>
  );
}
