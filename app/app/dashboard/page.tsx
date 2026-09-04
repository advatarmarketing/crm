import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import { DonutChart } from "@/components/DonutChart";

// This route is only ever reached by ceo/staff — middleware.ts routes
// videographer to /app/my-clients and client to /app/portal, and its
// ALLOWED_PREFIXES map doesn't include /app/dashboard for either of
// them. "All roles" in the spec for the Clients-by-Stage donut means
// both ceo and staff see the same component here; it isn't a claim
// that videographer/client can reach this page.
export default async function DashboardPage() {
  const supabase = createClient();

  // Every query below is sent as-is and rendered from whatever comes
  // back — no `if (role === 'ceo')` gate in this file. A staff
  // session's client_finance query returns zero rows because of the
  // RLS policy from Phase 4 (client_finance: ceo full access), not
  // because this page decided to hide it.
  const [{ data: clients }, { data: finance }, { count: prospectCount }] = await Promise.all([
    supabase.from("clients").select("id, stage, service"),
    supabase
      .from("client_finance")
      .select("client_id, monthly_value, clients(service)"),
    // Phase 6 — unreviewed prospects Fathom auto-created. A
    // videographer/client session can't reach this page at all
    // (middleware), and fathom_calls RLS is ceo/staff-only anyway,
    // so this count is naturally 0 for anyone who shouldn't see it.
    supabase.from("fathom_calls").select("id", { count: "exact", head: true }).eq("applied", true).is("reviewed_at", null),
  ]);

  const stageCounts = new Map<string, number>();
  for (const c of clients ?? []) {
    stageCounts.set(c.stage, (stageCounts.get(c.stage) ?? 0) + 1);
  }
  const stageData = ["lead", "proposal", "active"].map((stage) => ({
    label: stage.charAt(0).toUpperCase() + stage.slice(1),
    value: stageCounts.get(stage) ?? 0,
  }));

  const totalClients = clients?.length ?? 0;
  const activeClients = stageCounts.get("active") ?? 0;

  type FinanceRow = { client_id: string; monthly_value: number | null; clients: { service: string | null } | null };
  const financeRows = (finance ?? []) as unknown as FinanceRow[];

  const totalMonthlyRevenue = financeRows.reduce((sum, r) => sum + (r.monthly_value ?? 0), 0);

  const revenueByService = new Map<string, number>();
  for (const r of financeRows) {
    const service = r.clients?.service ?? "Other";
    revenueByService.set(service, (revenueByService.get(service) ?? 0) + (r.monthly_value ?? 0));
  }
  const revenueData = Array.from(revenueByService.entries()).map(([label, value]) => ({ label, value }));

  return (
    <main style={{ padding: "40px 32px", maxWidth: 1040, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
        Dashboard
      </h1>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 36 }}>
        <StatTile label="Total clients" value={String(totalClients)} />
        <StatTile label="Active clients" value={String(activeClients)} />
        {financeRows.length > 0 && (
          <StatTile label="Monthly revenue" value={`£${totalMonthlyRevenue.toLocaleString()}`} />
        )}
        {!!prospectCount && (
          <Link href="/app/prospects" style={{ textDecoration: "none", flex: "1 1 160px", minWidth: 160 }}>
            <StatTile label="Prospects to review" value={String(prospectCount)} />
          </Link>
        )}
      </div>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>
          Clients by stage
        </h2>
        <DonutChart data={stageData} centerLabel={`${totalClients} total`} />
      </section>

      {/* This section renders purely because financeRows came back
          non-empty. A staff session sees nothing here — not because
          of a role check in this file, but because the client_finance
          query above returned [] under RLS. */}
      {financeRows.length > 0 && (
        <section>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>
            Revenue by service
          </h2>
          <DonutChart data={revenueData} centerLabel={`£${totalMonthlyRevenue.toLocaleString()}/mo`} />
        </section>
      )}
    </main>
  );
}
