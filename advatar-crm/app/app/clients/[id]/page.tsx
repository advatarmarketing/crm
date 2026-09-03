import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientDetailTabs } from "@/components/ClientDetailTabs";
import type { AssignedTeamMember, AssignableProfile } from "@/components/AssignedTeamPanel";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const supabase = createClient();

  const [{ data: client }, { data: documents }, { data: tasks }, { data: finance }, { data: assignments }, { data: assignableProfiles }] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", params.id).single(),
      supabase
        .from("documents")
        .select("*")
        .eq("client_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("*")
        .eq("client_id", params.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      // ceo-only under RLS — `finance` is null for anyone else.
      supabase.from("client_finance").select("monthly_value").eq("client_id", params.id).maybeSingle(),
      // client_staff: ceo/staff full access (Phase 3) — a
      // videographer never reaches this page anyway (see the note in
      // AssignedTeamPanel.tsx), so this query is never even attempted
      // by anyone whose RLS would return something different.
      supabase
        .from("client_staff")
        .select("staff_id, role_on_client, profiles(full_name, role)")
        .eq("client_id", params.id),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["staff", "videographer"])
        .order("full_name"),
    ]);

  // A missing client here means either it doesn't exist, or RLS
  // filtered it out for this session (e.g. a videographer not
  // assigned to it) — both cases should look like "not found", not
  // leak which one it was.
  if (!client) {
    notFound();
  }

  type AssignmentRow = { staff_id: string; role_on_client: string | null; profiles: { full_name: string | null; role: string } | null };
  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];
  const teamMembers: AssignedTeamMember[] = assignmentRows.map((a) => ({
    staffId: a.staff_id,
    fullName: a.profiles?.full_name ?? null,
    role: a.profiles?.role ?? "staff",
    roleOnClient: a.role_on_client,
  }));

  const assignable: AssignableProfile[] = (assignableProfiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    role: p.role,
  }));

  return (
    <main style={{ padding: "40px 32px", maxWidth: 1040, margin: "0 auto" }}>
      <ClientDetailTabs
        client={client}
        documents={documents ?? []}
        tasks={tasks ?? []}
        monthlyValue={finance ? finance.monthly_value : undefined}
        initialTab={searchParams?.tab === "plan" ? "plan" : "info"}
        teamMembers={teamMembers}
        assignableProfiles={assignable}
      />
    </main>
  );
}
