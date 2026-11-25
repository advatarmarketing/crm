import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { reviewAndOpen } from "./actions";
import { SectionTabs, type SectionTab } from "@/components/SectionTabs";
import { NewProposalForm } from "@/components/proposals/NewProposalForm";
import { TemplatesPanel } from "@/components/proposals/TemplatesPanel";
import { internalClientIds } from "@/lib/internal-clients";
import { money } from "@/lib/proposals/pricing";

export const dynamic = "force-dynamic";

/**
 * Prospects: proposals (0057) and the discovery calls Fathom mapped.
 *
 * Proposals: every prospect deal (a business we're talking to, or an
 * existing client on a new deal) with its proposal versions, where
 * each one is up to, and clients who've paid but have no team yet.
 * RLS decides what each person sees: the CEO and operations every
 * deal, sales the deals they made.
 */

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "" },
  sent: { label: "Sent", tone: "pill-info" },
  superseded: { label: "Replaced", tone: "" },
  awaiting_payment: { label: "Accepted, not paid", tone: "pill-warn" },
  awaiting_cash: { label: "Waiting for cash", tone: "pill-warn" },
  paid: { label: "Paid", tone: "pill-ok" },
};

type DealRow = {
  id: string;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  client_id: string | null;
  status: string;
  updated_at: string;
  created_at: string;
  proposals: { id: string; version: number; status: string; first_opened_at: string | null; finished_at: string | null; paid_at: string | null; accepted_at: string | null; amount: number | null }[];
};

export default async function ProspectsPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  const role = (me as { role?: string } | null)?.role ?? "";
  const manager = role === "ceo" || role === "operations_manager";

  const [{ data: calls }, dealsRes, templatesRes, clientsRes, internal, needRes] = await Promise.all([
    supabase
      .from("fathom_calls")
      .select("id, client_id, summary, received_at, clients(name)")
      .eq("applied", true)
      .is("reviewed_at", null)
      .order("received_at", { ascending: false }),
    supabase
      .from("proposal_deals")
      .select("id, business_name, contact_name, email, client_id, status, updated_at, created_at, proposals(id, version, status, first_opened_at, finished_at, paid_at, accepted_at, amount)")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase.from("proposal_templates").select("id, name, created_by, updated_at").order("name"),
    supabase.from("clients").select("id, name").order("name"),
    internalClientIds(supabase),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager ? (supabase as any).rpc("clients_needing_team") : Promise.resolve({ data: [] }),
  ]);

  type Row = {
    id: string;
    client_id: string | null;
    summary: string | null;
    received_at: string | null;
    clients: { name: string } | null;
  };
  const rows = (calls ?? []) as unknown as Row[];
  const notRun = Boolean(dealsRes.error);
  const deals = ((dealsRes.data ?? []) as unknown as DealRow[]).map((d) => ({
    ...d,
    latest: [...(d.proposals ?? [])].sort((a, b) => b.version - a.version)[0] ?? null,
  }));
  const templates = (templatesRes.data ?? []) as { id: string; name: string; created_by: string | null; updated_at: string }[];
  const clients = ((clientsRes.data ?? []) as { id: string; name: string }[]).filter((c) => !internal.has(c.id));
  const needing = (needRes.data ?? []) as { client_id: string; name: string; paid_at: string | null; deal_id: string }[];

  const proposals = (
    <div className="pd">
      {notRun ? (
        <p className="access-note">Proposals start once database update 0057 has been run in Supabase.</p>
      ) : (
        <>
          {needing.length > 0 && (
            <section className="pd-need" aria-label="Needs a team">
              <h2>Needs a team</h2>
              <p>Paid, but nobody is on them yet. Open each one and add their team.</p>
              <ul>
                {needing.map((n) => (
                  <li key={n.client_id}>
                    <b>{n.name}</b>
                    {n.paid_at && <span>paid {new Date(n.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                    <Link className="btn" href={`/app/clients/${n.client_id}?tab=info`}>
                      Add their team
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <NewProposalForm templates={templates.map((t) => ({ id: t.id, name: t.name }))} clients={clients} />

          <section className="pd-list" aria-label="Deals">
            <h2>Deals</h2>
            {deals.length === 0 ? (
              <p className="pd-empty">No proposals yet. Start one above.</p>
            ) : (
              <ul>
                {deals.map((d) => {
                  const st = d.latest ? STATUS[d.latest.status] ?? { label: d.latest.status, tone: "" } : null;
                  const seen = d.latest?.finished_at ? "Read it all" : d.latest?.first_opened_at ? "Opened" : d.latest && d.latest.status !== "draft" ? "Not opened yet" : null;
                  return (
                    <li key={d.id}>
                      <Link href={`/app/prospects/deals/${d.id}`} className="pd-deal">
                        <span className="pd-deal-main">
                          <b>{d.business_name}</b>
                          <span>
                            {d.contact_name ?? "No contact yet"}
                            {d.client_id ? " · existing client" : ""}
                            {d.latest ? ` · v${d.latest.version}` : ""}
                          </span>
                        </span>
                        <span className="pd-deal-side">
                          {d.status === "lost" ? <span className="pill">Lost</span> : st && <span className={`pill ${st.tone}`}>{st.label}</span>}
                          {seen && <span className="pd-seen">{seen}</span>}
                          {d.latest?.amount != null && <span className="pd-amt">{money(Number(d.latest.amount))}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <TemplatesPanel templates={templates} canManageAll={manager} me={user?.id ?? null} />
        </>
      )}
    </div>
  );

  const discovery = (
    <div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 20px" }}>
        Discovery calls Fathom auto-mapped into a draft client + plan. Nothing here has been
        confirmed by a person yet — open each one and check it before publishing.
      </p>
      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          Nothing to review right now.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "16px 18px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--text-1)" }}>
                  {row.clients?.name ?? "Untitled prospect"}
                </div>
                {row.summary && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--text-2)",
                      maxWidth: 520,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.summary}
                  </p>
                )}
                {row.received_at && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                    {new Date(row.received_at).toLocaleString()}
                  </span>
                )}
              </div>

              {row.client_id ? (
                <form action={reviewAndOpen}>
                  <input type="hidden" name="callId" value={row.id} />
                  <input type="hidden" name="clientId" value={row.client_id} />
                  <button
                    type="submit"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "10px 16px",
                      borderRadius: 20,
                      border: "1px solid var(--text-1)",
                      background: "var(--text-1)",
                      color: "var(--bg)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Review &amp; Open
                  </button>
                </form>
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-closed)" }}>
                  No client created
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const tabs: SectionTab[] = [
    { key: "proposals", label: "Proposals", badge: needing.length, content: proposals },
    { key: "calls", label: "Discovery calls", badge: rows.length, content: discovery },
  ];

  return (
    <main className="page page-md">
      <h1 className="page-title page-title-accent" style={{ marginBottom: 20 }}>
        Prospects
      </h1>
      <SectionTabs tabs={tabs} start={searchParams?.tab ?? null} />
    </main>
  );
}
