import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadByCode } from "@/lib/proposals/server";
import { contractText, cleanChoice } from "@/lib/proposals/pricing";
import { PrintButton } from "@/components/proposals/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract · Advatar", robots: { index: false, follow: false } };

/** The contract as agreed (or, before that, as it stands), ready to print or save as PDF. */
export default async function ContractPage({ params }: { params: { code: string } }) {
  const p = await loadByCode(params.code);
  if (!p || p.status === "draft") notFound();
  const admin = createAdminClient();
  const { data } = await admin
    .from("proposal_acceptances")
    .select("contract_text, email, accepted_at")
    .eq("proposal_id", p.id)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accepted = data as { contract_text: string; email: string; accepted_at: string } | null;
  const text = accepted?.contract_text ?? contractText(p.content, cleanChoice(p.content, p.choice ?? undefined), { business: p.deal.business, contact: p.deal.contact, email: p.deal.email });
  return (
    <main className="doc-print">
      <div className="doc-print-bar">
        <span>{accepted ? `Accepted by ${accepted.email} on ${new Date(accepted.accepted_at).toLocaleString("en-GB")}` : "Not accepted yet"}</span>
        <PrintButton />
      </div>
      <pre>{text}</pre>
    </main>
  );
}
