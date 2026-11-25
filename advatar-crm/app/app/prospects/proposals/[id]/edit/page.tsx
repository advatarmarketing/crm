import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProposalEditor } from "@/components/proposals/ProposalEditor";
import { defaultContent, DEFAULT_MESSAGE, type ProposalContent } from "@/lib/proposals/content";
import { parseContent } from "@/lib/proposals/schema";

export const dynamic = "force-dynamic";

export default async function EditProposalPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, deal_id, version, content, message, accepted_at, status, proposal_deals(business_name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as unknown as { id: string; deal_id: string; version: number; content: unknown; message: string | null; accepted_at: string | null; status: string; proposal_deals: { business_name: string } | null };
  const parsed = parseContent(p.content);
  const content: ProposalContent = parsed.ok ? parsed.content : defaultContent();
  const { data: tpls } = await supabase.from("proposal_templates").select("id, name").order("name");
  return (
    <main className="page page-lg">
      <ProposalEditor
        proposalId={p.id}
        dealId={p.deal_id}
        title={`${p.proposal_deals?.business_name ?? "Proposal"} · version ${p.version}`}
        initial={content}
        initialMessage={p.message ?? DEFAULT_MESSAGE}
        locked={Boolean(p.accepted_at) || p.status === "superseded"}
        templates={(tpls ?? []) as { id: string; name: string }[]}
      />
    </main>
  );
}
