import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";

// CEO-only page. middleware.ts already keeps non-staff roles out of
// /app/* entirely, but staff (non-CEO) can reach /app routes too —
// this page additionally checks for role === 'ceo' specifically and
// bounces anyone else back to the dashboard.
export default async function TeamSettingsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ceo") {
    redirect("/app/dashboard");
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 24px" }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 32,
          letterSpacing: "0.02em",
          margin: "0 0 4px",
          color: "var(--text-1)",
        }}
      >
        Team
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--text-2)",
          margin: "0 0 32px",
        }}
      >
        Invite a staff, videographer, or CEO login. Client accounts are
        created from a client's detail page, not here.
      </p>
      <InviteForm />
    </main>
  );
}
