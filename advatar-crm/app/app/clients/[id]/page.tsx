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

  const [
    { data: client },
    { data: documents },
    { data: tasks },
    { data: finance },
    { data: assignments },
    { data: assignableProfiles },
    { data: invoices },
    { data: meetings },
    { data: activity },
    { data: checklist },
    { data: templates },
  ] = await Promise.all([
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
      supabase
        .from("client_finance")
        .select("monthly_value, billing_amount, billing_frequency, billing_notes")
        .eq("client_id", params.id)
        .maybeSingle(),
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
      // Phase 14. "invoices: management full access"
      // (0011_invoices_finance.sql) means this comes back empty for
      // staff and videographers rather than erroring, so the finance
      // section below simply doesn't render for them — same pattern as
      // the client_finance query above.
      supabase
        .from("invoices")
        .select("id, client_id, number, service, amount, invoice_date, due_date, paid_at, status")
        .eq("client_id", params.id)
        .order("invoice_date", { ascending: false, nullsFirst: false }),
      // Phase 15: meetings attached to this client, whether they
      // arrived through the webhook or were attached by hand.
      supabase
        .from("fathom_calls")
        .select("id, title, meeting_url, summary, received_at, source")
        .eq("client_id", params.id)
        .order("received_at", { ascending: false, nullsFirst: false }),
      // Newest 50 timeline entries. Capped rather than unbounded
      // because this grows forever and nobody scrolls past the first
      // screenful of history on a page they opened to do something
      // else.
      supabase
        .from("client_activity")
        .select("id, kind, summary, created_at, profiles(full_name)")
        .eq("client_id", params.id)
        .order("created_at", { ascending: false })
        .limit(50),
      // Phase 17: onboarding checklist, created automatically when a
      // client becomes Active (0014_onboarding_templates.sql).
      supabase
        .from("client_checklist_items")
        .select("id, label, done, position")
        .eq("client_id", params.id)
        .order("position"),
      supabase.from("task_templates").select("id, name").order("name"),
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

  type ActivityRow = {
    id: string;
    kind: string;
    summary: string;
    created_at: string;
    profiles: { full_name: string | null } | null;
  };
  const activityEntries = ((activity ?? []) as unknown as ActivityRow[]).map((a) => ({
    id: a.id,
    kind: a.kind,
    summary: a.summary,
    created_at: a.created_at,
    actorName: a.profiles?.full_name ?? null,
  }));

  const assignable: AssignableProfile[] = (assignableProfiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    role: p.role,
  }));

  return (
    <main className="page">
      <ClientDetailTabs
        client={client}
        documents={documents ?? []}
        tasks={tasks ?? []}
        monthlyValue={finance ? finance.monthly_value : undefined}
        finance={finance ?? undefined}
        initialTab={searchParams?.tab === "plan" ? "plan" : "info"}
        teamMembers={teamMembers}
        assignableProfiles={assignable}
        invoices={invoices ?? []}
        meetings={(meetings ?? []) as any}
        activity={activityEntries}
        checklist={(checklist ?? []) as any}
        templates={(templates ?? []) as any}
      />
    </main>
  );
}
