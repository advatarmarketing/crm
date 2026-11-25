import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DealView, type DealVersion } from "@/components/proposals/DealView";
import { buildReport, type TrackRow } from "@/lib/proposals/tracking";
import { requestOrigin } from "@/lib/proposals/origin";
import { emailIsConfigured } from "@/lib/email";
import { cardPaymentsOn } from "@/lib/stripe-checkout";
import { money, totals } from "@/lib/proposals/pricing";
import type { Choice, ProposalContent } from "@/lib/proposals/content";

export const dynamic = "force-dynamic";

/** One prospect deal (0057): its versions, what the client did, and payment. */
export default async function DealPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
  const supabase = createClient();
  const { data: deal } = await supabase
    .from("proposal_deals")
    .select("id, business_name, contact_name, email, client_id, status, notes, owner_id, created_at, clients(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!deal) notFound();
  const d = deal as unknown as {
    id: string;
    business_name: string;
    contact_name: string | null;
    email: string | null;
    client_id: string | null;
    status: "open" | "won" | "lost";
    notes: string | null;
    owner_id: string | null;
    created_at: string;
    clients: { name: string } | null;
  };

  const { data: props } = await supabase
    .from("proposals")
    .select("id, version, code, status, content, message, created_at, sent_at, first_opened_at, finished_at, choice, accepted_email, accepted_at, amount, invoice_number, payment_method, paid_at, client_id, login_profile_id, emailed_at, email_problem")
    .eq("deal_id", d.id)
    .order("version", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (props ?? []) as any[];
  const selected = rows.find((r) => r.id === searchParams.v) ?? rows[0] ?? null;

  let report = null;
  let payments: { method: string; amount: number; kind: string; received_at: string; note: string | null }[] = [];
  let acceptance: { email: string; package: string; plan: string; total: number; accepted_at: string; ip: string | null } | null = null;
  if (selected) {
    const [ev, pay, acc] = await Promise.all([
      supabase.from("proposal_events").select("session_id, kind, slide, package, ms, detail, at").eq("proposal_id", selected.id).order("at").limit(20000),
      supabase.from("proposal_payments").select("method, amount, kind, received_at, note").eq("proposal_id", selected.id).order("received_at", { ascending: false }),
      supabase.from("proposal_acceptances").select("email, package, plan, total, accepted_at, ip").eq("proposal_id", selected.id).order("accepted_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    report = buildReport(selected.content as ProposalContent, (ev.data ?? []) as TrackRow[]);
    payments = ((pay.data ?? []) as typeof payments).map((p) => ({ ...p, amount: Number(p.amount) }));
    acceptance = acc.data as typeof acceptance;
  }

  const origin = requestOrigin();
  const versions: DealVersion[] = rows.map((r) => {
    const content = r.content as ProposalContent;
    const choice = r.choice as Choice | null;
    const t = choice ? totals(content, choice) : null;
    return {
      id: r.id,
      version: r.version,
      status: r.status,
      link: `${origin}/proposal/${r.code}`,
      message: r.message ?? "",
      createdAt: r.created_at,
      sentAt: r.sent_at,
      openedAt: r.first_opened_at,
      finishedAt: r.finished_at,
      acceptedAt: r.accepted_at,
      acceptedEmail: r.accepted_email,
      paidAt: r.paid_at,
      amount: r.amount == null ? null : Number(r.amount),
      invoiceNumber: r.invoice_number,
      paymentMethod: r.payment_method,
      clientId: r.client_id,
      hasLogin: Boolean(r.login_profile_id),
      emailProblem: r.email_problem,
      emailedAt: r.emailed_at,
      choiceText: choice && t ? `${content.packages.find((p) => p.id === choice.package)?.name ?? choice.package}, ${choice.plan === "upfront" ? "3 months upfront" : "monthly"} (${money(t.monthly)}/month)` : null,
      packagesMonthly: content.packages.filter((p) => p.enabled).map((p) => ({ name: p.name, monthly: totals(content, { package: p.id, plan: "monthly", extras: {} }).monthly })),
    };
  });

  return (
    <main className="page page-md">
      <p style={{ margin: "0 0 10px" }}>
        <Link href="/app/prospects" className="back-link">
          ← Prospects
        </Link>
      </p>
      <DealView
        deal={{ id: d.id, business: d.business_name, contact: d.contact_name, email: d.email, clientId: d.client_id, clientName: d.clients?.name ?? null, status: d.status, notes: d.notes }}
        versions={versions}
        selectedId={selected?.id ?? null}
        report={report}
        payments={payments}
        acceptance={acceptance}
        emailOn={emailIsConfigured()}
        cardOn={cardPaymentsOn()}
      />
    </main>
  );
}
