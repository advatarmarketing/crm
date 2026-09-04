import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import { formatMoney, isPast } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The last seven days, in one screen — what came in, what closed,
 * what got paid, and what's still hanging over.
 *
 * Built from the activity timeline rather than by re-deriving events
 * from each table: the timeline already records stage changes,
 * invoices and uploads with a timestamp, so "what happened this week"
 * is one query against one table instead of five heuristics that
 * would drift apart from each other.
 */
export default async function SummaryPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const [{ data: activity }, { data: invoices }, { data: tasks }, { data: clients }] = await Promise.all([
    supabase
      .from("client_activity")
      .select("id, kind, summary, created_at, clients(name)")
      .gte("created_at", weekAgoIso)
      .order("created_at", { ascending: false }),
    supabase.from("invoices").select("id, amount, status, paid_at, created_at, due_date"),
    supabase.from("tasks").select("id, done, updated_at").eq("done", true).gte("updated_at", weekAgoIso),
    supabase.from("clients").select("id, name, stage, created_at, follow_up_date"),
  ]);

  type ActivityRow = {
    id: string;
    kind: string;
    summary: string;
    created_at: string;
    clients: { name: string } | null;
  };
  const events = (activity ?? []) as unknown as ActivityRow[];
  const allInvoices = invoices ?? [];
  const allClients = clients ?? [];

  const newClients = allClients.filter((c) => new Date(c.created_at) >= weekAgo);
  const wonThisWeek = events.filter((e) => e.kind === "stage_changed" && e.summary.includes("to active"));

  const invoicesRaised = allInvoices.filter((i) => new Date(i.created_at) >= weekAgo);
  const paidThisWeek = allInvoices.filter((i) => i.status === "paid" && i.paid_at && new Date(i.paid_at) >= weekAgo);
  const paidTotal = paidThisWeek.reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const overdueNow =
    allClients.filter((c) => c.stage !== "active" && isPast(c.follow_up_date)).length +
    allInvoices.filter((i) => i.status === "sent" && isPast(i.due_date)).length;

  return (
    <main className="page page-sm">
      <div className="page-head">
        <h1 className="page-title">This week</h1>
        <Link href="/app/dashboard" className="btn">
          Dashboard
        </Link>
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        The last seven days across the whole agency.
      </p>

      <div className="stat-row">
        <StatTile label="New leads" value={String(newClients.length)} />
        <StatTile label="Deals won" value={String(wonThisWeek.length)} />
        <StatTile label="Invoices raised" value={String(invoicesRaised.length)} />
        <StatTile label="Money in" value={formatMoney(paidTotal)} hint={`${paidThisWeek.length} paid`} />
        <StatTile label="Tasks completed" value={String((tasks ?? []).length)} />
        <StatTile label="Overdue now" value={String(overdueNow)} />
      </div>

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: "8px 0 16px" }}>What happened</h2>

      {events.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
          Nothing recorded in the last seven days.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {events.slice(0, 60).map((e) => (
            <li
              key={e.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                padding: "9px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
              }}
            >
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-1)", minWidth: 0 }}>
                {e.clients?.name && (
                  <span style={{ color: "var(--text-3)" }}>{e.clients.name} · </span>
                )}
                {e.summary}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", flexShrink: 0 }}>
                {new Date(e.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
