import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProposalShow } from "@/components/proposals/ProposalShow";
import { parseContent } from "@/lib/proposals/schema";
import { cardPaymentsOn } from "@/lib/stripe-checkout";

export const dynamic = "force-dynamic";

/** Exactly what the client will see, with nothing tracked, saved or charged. */
export default async function PreviewProposalPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, deal_id, content, proposal_deals(business_name, contact_name, email)")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as { id: string; deal_id: string; content: unknown; proposal_deals: { business_name: string; contact_name: string | null; email: string | null } | null };
  const parsed = parseContent(p.content);
  if (!parsed.ok) return <main className="page page-sm"><p className="vm-error">This proposal has a problem: {parsed.error}</p></main>;
  return (
    <ProposalShow
      content={parsed.content}
      code={null}
      mode="preview"
      who={{ business: p.proposal_deals?.business_name ?? "", contact: p.proposal_deals?.contact_name ?? null, email: p.proposal_deals?.email ?? null }}
      cardOn={cardPaymentsOn()}
      closeHref={`/app/prospects/deals/${p.deal_id}?v=${p.id}`}
    />
  );
}
