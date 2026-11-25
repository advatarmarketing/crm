import type { Metadata } from "next";
import { ProposalShow } from "@/components/proposals/ProposalShow";
import { ProposalStatus } from "@/components/proposals/ProposalStatus";
import { linkOpen, loadByCode, newerSentVersion } from "@/lib/proposals/server";
import { cardPaymentsOn } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your proposal · Advatar", robots: { index: false, follow: false } };

/**
 * The client's proposal link (0057). Not signed in: the long code is
 * the key. Shows the slideshow while it's open, or a short status page
 * once it's paid, updated or not ready.
 */
export default async function ProposalPage({ params, searchParams }: { params: { code: string }; searchParams: { paid?: string; cancelled?: string } }) {
  const p = await loadByCode(params.code);
  if (!p) return <ProposalStatus kind="missing" />;

  if (p.status === "paid") return <ProposalStatus kind="paid" business={p.deal.business} email={p.acceptedEmail} method={p.paymentMethod} code={p.code} />;
  if (searchParams.paid === "1") return <ProposalStatus kind="confirming" business={p.deal.business} code={p.code} />;

  if (p.status === "superseded" || !linkOpen(p)) {
    const newer = await newerSentVersion(p);
    if (newer) return <ProposalStatus kind="updated" business={p.deal.business} newCode={newer} />;
    return <ProposalStatus kind={p.status === "draft" ? "not-ready" : "updated"} business={p.deal.business} />;
  }

  return (
    <ProposalShow
      content={p.content}
      code={p.code}
      mode="live"
      who={{ business: p.deal.business, contact: p.deal.contact, email: p.acceptedEmail ?? p.deal.email }}
      cardOn={cardPaymentsOn()}
      initialChoice={p.choice}
      initialStage={p.status === "awaiting_cash" ? "cash" : "show"}
      amount={p.status === "awaiting_cash" ? p.amount : null}
      invoiceNumber={p.invoiceNumber}
    />
  );
}
