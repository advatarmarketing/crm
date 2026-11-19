import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDashboard } from "@/lib/social/dashboard";
import { loadPicker } from "@/lib/social/connect";
import { parseRange } from "@/lib/social";
import { SocialDashboard } from "@/components/social/SocialDashboard";

export const dynamic = "force-dynamic";

/**
 * Content Hub: how the client's social media is doing.
 *
 * Followers, likes, comments, posts and their best videos on Facebook,
 * Instagram and TikTok — read from the platforms' own APIs once a day
 * (lib/social/sync.ts), and only for the platforms the team has said
 * we post on for this client.
 */
export default async function PortalContentHubPage({
  searchParams,
}: {
  searchParams: { range?: string; choose?: string; social_error?: string; social_connected?: string };
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
  const picker = searchParams.choose ? await loadPicker(createAdminClient(), searchParams.choose, user.id, profile.client_id) : null;

  return (
    <main className="page">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 6px" }}>Content Hub</h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-2)", margin: "0 0 22px", maxWidth: "60ch", lineHeight: 1.6 }}>
        How your social media is performing, straight from each platform.
      </p>
      <SocialDashboard
        data={data}
        clientId={profile.client_id}
        audience="client"
        basePath="/app/portal/content"
        range={range}
        notice={{ error: searchParams.social_error?.slice(0, 300) ?? null, connected: searchParams.social_connected ?? null }}
        picker={picker}
      />
    </main>
  );
}
