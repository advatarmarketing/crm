import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { InviteForm } from "./invite-form";
import { TeamMemberList, type TeamMemberRow } from "@/components/TeamMemberList";

const TEAM_ROLES = ["ceo", "operations_manager", "staff", "videographer"];

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

  // Emails come from auth.users via the service-role client: profiles
  // has no email column, and a list of rows all reading "Unnamed"
  // would be impossible to fill in correctly without something to
  // identify each person by. Safe here because this page has already
  // established the caller is the CEO.
  const admin = createAdminClient();

  const { data: teamProfiles } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .in("role", TEAM_ROLES)
    .order("full_name", { nullsFirst: true });

  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailById = new Map<string, string | null>(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  const members: TeamMemberRow[] = ((teamProfiles ?? []) as { id: string; full_name: string | null; role: string }[]).map(
    (p) => ({
      id: p.id,
      fullName: p.full_name,
      role: p.role,
      email: emailById.get(p.id) ?? null,
    })
  );

  const unnamedCount = members.filter((m) => !m.fullName).length;

  return (
    <main className="page-narrow">
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

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 4px" }}>
          Everyone on the team
        </h2>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 16px" }}>
          {unnamedCount > 0
            ? `${unnamedCount} ${unnamedCount === 1 ? "person has" : "people have"} no name set yet, which is why they show as "Unnamed" on client pages. Add their names below and save.`
            : "Names shown here are what appears on client pages, assignment dropdowns and task views."}
        </p>
        {members.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            No team members yet.
          </p>
        ) : (
          <TeamMemberList members={members} />
        )}
      </div>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
        <a
          href="/app/settings/templates"
          className="btn"
          style={{ textDecoration: "none" }}
        >
          Task templates →
        </a>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: "10px 0 0" }}>
          Repeatable sets of tasks your team can apply to a client in one click.
        </p>
      </div>
    </main>
  );
}
