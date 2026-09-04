import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import { DonutChart } from "@/components/DonutChart";
import { AttentionList, type AttentionItem } from "@/components/AttentionList";
import { formatMoney, daysSince, isPast, startOfToday } from "@/lib/format";

export const dynamic = "force-dynamic";

const QUIET_AFTER_DAYS = 21;

/**
 * The morning screen: what needs attention today, then how the
 * business is doing.
 *
 * There is not a single `role === ...` branch in here, deliberately.
 * Every query runs under the caller's own RLS, so staff get their
 * assigned clients' work and nothing else, and the money sections
 * simply have no rows to render for anyone who can't read `invoices`
 * or `client_finance`. The page shows whatever came back rather than
 * deciding who deserves what — which means it can't drift out of
 * agreement with the database about who sees what.
 */
export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = startOfToday();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const [{ data: clients }, { data: invoices }, { data: tasks }, { data: finance }, { count: prospectCount }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, stage, service, follow_up_date, last_contacted_at, estimated_value, likelihood"),
      supabase.from("invoices").select("id, client_id, amount, due_date, paid_at, status, number, clients(name)"),
      supabase
        .from("tasks")
        .select("id, client_id, text, due_date, done, assigned_to, clients(name)")
        .eq("done", false),
      supabase.from("client_finance").select("client_id, monthly_value, clients(service)"),
      supabase
        .from("fathom_calls")
        .select("id", { count: "exact", head: true })
        .eq("applied", true)
        .is("reviewed_at", null),
    ]);

  const allClients = clients ?? [];

  type InvoiceRow = {
    id: string;
    client_id: string;
    amount: number | null;
    due_date: string | null;
    paid_at: string | null;
    status: string | null;
    number: string | null;
    clients: { name: string } | null;
  };
  const allInvoices = (invoices ?? []) as unknown as InvoiceRow[];

  type TaskRow = {
    id: string;
    client_id: string | null;
    text: string;
    due_date: string | null;
    done: boolean;
    assigned_to: string | null;
    clients: { name: string } | null;
  };
  const openTasks = (tasks ?? []) as unknown as TaskRow[];

  // ---------------- needs attention ----------------

  const overdueFollowUps: AttentionItem[] = allClients
    .filter((c) => c.stage !== "active" && isPast(c.follow_up_date))
    .map((c) => ({
      id: `follow-${c.id}`,
      href: `/app/clients/${c.id}`,
      label: c.name,
      detail: `follow-up due ${new Date(c.follow_up_date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
      severity: "bad" as const,
    }));

  const overdueInvoices: AttentionItem[] = allInvoices
    .filter((i) => i.status === "sent" && i.due_date && new Date(i.due_date) < today)
    .map((i) => ({
      id: `inv-${i.id}`,
      href: `/app/finance/${i.id}`,
      label: `${i.clients?.name ?? "Client"} — ${formatMoney(i.amount)}`,
      detail: `invoice overdue since ${new Date(i.due_date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
      severity: "bad" as const,
    }));

  const dueTasks: AttentionItem[] = openTasks
    .filter((t) => t.due_date && new Date(t.due_date) <= today)
    .map((t) => ({
      id: `task-${t.id}`,
      href: t.client_id ? `/app/clients/${t.client_id}` : "/app/dashboard",
      label: t.text,
      detail: `${t.clients?.name ? `${t.clients.name} · ` : ""}${isPast(t.due_date) ? "overdue" : "due today"}`,
      severity: isPast(t.due_date) ? ("bad" as const) : ("warn" as const),
    }));

  // Active clients nobody has spoken to in a while. Only counts
  // clients with a contact logged at all — a brand-new client nobody
  // has called yet isn't "going quiet", it just hasn't started.
  const quietClients: AttentionItem[] = allClients
    .filter((c) => {
      if (c.stage !== "active") return false;
      const since = daysSince(c.last_contacted_at);
      return since !== null && since >= QUIET_AFTER_DAYS;
    })
    .map((c) => ({
      id: `quiet-${c.id}`,
      href: `/app/clients/${c.id}`,
      label: c.name,
      detail: `no contact for ${daysSince(c.last_contacted_at)} days`,
      severity: "warn" as const,
    }));

  const attention = [...overdueInvoices, ...overdueFollowUps, ...dueTasks, ...quietClients];

  // ---------------- money ----------------

  const paidThisMonth = allInvoices
    .filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at) >= monthStart)
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const paidLastMonth = allInvoices
    .filter(
      (i) =>
        i.status === "paid" &&
        i.paid_at &&
        new Date(i.paid_at) >= lastMonthStart &&
        new Date(i.paid_at) < monthStart
    )
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const outstanding = allInvoices
    .filter((i) => i.status === "sent")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const financeRows = (finance ?? []) as unknown as {
    client_id: string;
    monthly_value: number | null;
    clients: { service: string | null } | null;
  }[];
  const mrr = financeRows.reduce((sum, r) => sum + (r.monthly_value ?? 0), 0);

  // Only meaningful with something to compare against — a first month
  // would otherwise read as an infinite increase.
  const monthDelta =
    paidLastMonth > 0 ? Math.round(((paidThisMonth - paidLastMonth) / paidLastMonth) * 100) : null;

  // ---------------- pipeline ----------------

  const open = allClients.filter((c) => c.stage === "lead" || c.stage === "proposal");
  const weighted = open.reduce((sum, c) => sum + (c.estimated_value ?? 0) * ((c.likelihood ?? 50) / 100), 0);
  const activeCount = allClients.filter((c) => c.stage === "active").length;
  const conversionBase = activeCount + open.length;
  const conversion = conversionBase > 0 ? Math.round((activeCount / conversionBase) * 100) : null;

  const stageCounts = new Map<string, number>();
  for (const c of allClients) stageCounts.set(c.stage, (stageCounts.get(c.stage) ?? 0) + 1);
  const stageData = ["lead", "proposal", "active"].map((stage) => ({
    label: stage.charAt(0).toUpperCase() + stage.slice(1),
    value: stageCounts.get(stage) ?? 0,
  }));

  const revenueByService = new Map<string, number>();
  for (const r of financeRows) {
    const service = r.clients?.service ?? "Other";
    revenueByService.set(service, (revenueByService.get(service) ?? 0) + (r.monthly_value ?? 0));
  }
  const revenueData = Array.from(revenueByService.entries()).map(([label, value]) => ({ label, value }));

  // ---------------- upcoming work ----------------

  const upcoming = openTasks
    .filter((t) => t.due_date && new Date(t.due_date) > today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 8);

  const myTasks = user ? openTasks.filter((t) => t.assigned_to === user.id).length : 0;

  return (
    <main className="page">
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        Dashboard
      </h1>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 4px" }}>Needs attention</h2>
        <p style={eyebrow}>
          {attention.length === 0
            ? "Nothing outstanding"
            : `${attention.length} thing${attention.length === 1 ? "" : "s"} to deal with`}
        </p>
        <AttentionList items={attention} />
      </section>

      {/* Money. Renders only because rows came back — a staff session
          gets none, so this whole section disappears for them without
          a role check here. */}
      {(allInvoices.length > 0 || financeRows.length > 0) && (
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>Money</h2>
          <div className="stat-row">
            <Link href="/app/finance" style={tileLink}>
              <StatTile
                label="Paid this month"
                value={formatMoney(paidThisMonth)}
                hint={monthDelta === null ? undefined : `${monthDelta >= 0 ? "+" : ""}${monthDelta}% vs last month`}
              />
            </Link>
            <Link href="/app/finance" style={tileLink}>
              <StatTile label="Outstanding" value={formatMoney(outstanding)} />
            </Link>
            {financeRows.length > 0 && <StatTile label="Monthly recurring" value={formatMoney(mrr)} />}
          </div>
        </section>
      )}

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>Pipeline</h2>
        <div className="stat-row">
          <Link href="/app/leads" style={tileLink}>
            <StatTile label="Weighted pipeline" value={formatMoney(weighted)} hint={`${open.length} open`} />
          </Link>
          <Link href="/app/clients" style={tileLink}>
            <StatTile label="Active clients" value={String(activeCount)} />
          </Link>
          {conversion !== null && <StatTile label="Won rate" value={`${conversion}%`} />}
          {!!prospectCount && (
            <Link href="/app/prospects" style={tileLink}>
              <StatTile label="Prospects to review" value={String(prospectCount)} />
            </Link>
          )}
        </div>

        {allClients.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <DonutChart data={stageData} centerLabel={`${allClients.length} total`} />
          </div>
        )}
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 4px" }}>Coming up</h2>
        <p style={eyebrow}>
          {myTasks > 0 ? `${myTasks} assigned to you` : "Next deadlines across every client"}
        </p>

        {upcoming.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>Nothing scheduled.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map((t) => (
              <li
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)", minWidth: 0 }}>
                  {t.text}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", flexShrink: 0 }}>
                  {t.clients?.name ? `${t.clients.name} · ` : ""}
                  {new Date(t.due_date!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revenueData.length > 0 && (
        <section>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "0 0 16px" }}>Revenue by service</h2>
          <DonutChart data={revenueData} centerLabel={`${formatMoney(mrr)}/mo`} />
        </section>
      )}
    </main>
  );
}

const eyebrow = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-3)",
  margin: "0 0 16px",
};

const tileLink = { textDecoration: "none", flex: "1 1 160px", minWidth: 160 };
