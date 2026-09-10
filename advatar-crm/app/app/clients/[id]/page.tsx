import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ClientDetailTabs } from "@/components/ClientDetailTabs";
import type { AssignedTeamMember, AssignableProfile } from "@/components/AssignedTeamPanel";
import type { BrandKit } from "@/components/BrandKitPanel";
import type { TeamMessage } from "@/components/ClientTeamThread";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    { data: brandKit },
    { data: teamMessages },
    { data: allProfiles },
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
        .select("staff_id, role_on_client, profiles(full_name, role, phone)")
        .eq("client_id", params.id),
      // Everyone on the team, not just staff and videographers.
      // Operations managers were missing, which mattered more than it
      // looks: since 0024 an operations manager only sees the clients
      // they are ON, so leaving them out of this list meant there was
      // no way to give one a client at all. CEOs are here too, so the
      // account lead can be recorded — their access doesn't depend on
      // it (is_ceo_role() in 0024 sees everything regardless), but who
      // owns the relationship is worth writing down.
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["ceo", "operations_manager", "staff", "videographer"])
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
      supabase.from("client_brand_kits").select("*").eq("client_id", params.id).maybeSingle(),
      supabase
        .from("client_team_messages")
        .select("id, body, created_at, author_id")
        .eq("client_id", params.id)
        .order("created_at", { ascending: true }),
      // Names for the team thread. assignableProfiles above is only
      // staff and videographers, and a CEO or ops manager posting here
      // would otherwise show as "Someone".
      supabase.from("profiles").select("id, full_name, role"),
    ]);

  // A missing client here means either it doesn't exist, or RLS
  // filtered it out for this session (e.g. a videographer not
  // assigned to it) — both cases should look like "not found", not
  // leak which one it was.
  if (!client) {
    notFound();
  }

  type AssignmentRow = { staff_id: string; role_on_client: string | null; profiles: { full_name: string | null; role: string; phone: string | null } | null };
  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];
  const teamMembers: AssignedTeamMember[] = assignmentRows.map((a) => ({
    staffId: a.staff_id,
    fullName: a.profiles?.full_name ?? null,
    role: a.profiles?.role ?? "staff",
    roleOnClient: a.role_on_client,
    phone: a.profiles?.phone ?? null,
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

  const nameById = new Map(
    ((allProfiles ?? []) as unknown as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name?.trim() || null,
    ])
  );

  const teamThread: TeamMessage[] = ((teamMessages ?? []) as unknown as TeamMessage[]).map((m) => ({
    ...m,
    authorName: m.author_id ? nameById.get(m.author_id) ?? null : null,
  }));

  const assignable: AssignableProfile[] = (assignableProfiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    role: p.role,
  }));

  // Who may change the assignments, and over whom.
  //
  // 0024 narrowed `client_staff` writes to the CEO so an operations
  // manager could not hand themselves a client. 0027 gives them back
  // the everyday half of the job: they may add and remove staff and
  // videographers on a client they already run, but not themselves,
  // another manager, or the CEO.
  //
  // This mirrors that split rather than enforcing it — the database
  // refuses the write either way. Rendering a name they cannot assign
  // would just produce a row-level-security error on the first click.
  const callerRole = ((allProfiles ?? []) as unknown as { id: string; role?: string }[]).find(
    (p) => p.id === user?.id
  )?.role;

  const canAssign = callerRole === "ceo" || callerRole === "operations_manager";

  const assignableHere =
    callerRole === "ceo"
      ? assignable
      : assignable.filter((p) => p.id !== user?.id && (p.role === "staff" || p.role === "videographer"));

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
        assignableProfiles={assignableHere}
        canAssign={canAssign}
        assignScope={callerRole === "ceo" ? "everyone" : "workers"}
        invoices={invoices ?? []}
        meetings={(meetings ?? []) as any}
        activity={activityEntries}
        checklist={(checklist ?? []) as any}
        templates={(templates ?? []) as any}
        brandKit={(brandKit as BrandKit | null) ?? null}
        teamMessages={teamThread}
        currentUserId={user?.id ?? null}
      />
    </main>
  );
}
