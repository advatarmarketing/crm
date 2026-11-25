"use server";

import { accept, chooseCash, loadByCode, saveCheckout, linkOpen } from "@/lib/proposals/server";
import { requestMeta, requestOrigin } from "@/lib/proposals/origin";
import { cardPaymentsOn, createCheckout } from "@/lib/stripe-checkout";
import { money } from "@/lib/proposals/pricing";

/**
 * The client's actions on their proposal link (0057). Not signed in:
 * the long code in the link is the only key, and every price is
 * worked out again on the server.
 */

export async function acceptAction(code: string, choice: unknown, email: string) {
  const p = await loadByCode(code);
  if (!p) return { ok: false as const, error: "This proposal link isn't valid." };
  return accept(p, choice, email, requestMeta());
}

export async function cardAction(code: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const p = await loadByCode(code);
  if (!p || !linkOpen(p) || !p.acceptedAt || !p.choice || !p.amount || !p.acceptedEmail) return { ok: false, error: "Please accept the proposal first." };
  if (!cardPaymentsOn()) return { ok: false, error: "Card payments aren't available yet. Choose cash, or get in touch with us." };
  const origin = requestOrigin();
  const pkg = p.content.packages.find((x) => x.id === p.choice!.package)?.name ?? "Advatar";
  const res = await createCheckout({
    plan: p.choice.plan,
    amount: p.amount,
    email: p.acceptedEmail,
    productName: `Advatar ${pkg} package${p.choice.plan === "upfront" ? " (3 months upfront)" : ""}`,
    description: `${p.deal.business}. Invoice ${p.invoiceNumber ?? ""}. ${p.choice.plan === "upfront" ? `${money(p.amount)} for 3 months.` : `${money(p.amount)} a month.`}`,
    proposalId: p.id,
    successUrl: `${origin}/proposal/${p.code}?paid=1`,
    cancelUrl: `${origin}/proposal/${p.code}?cancelled=1`,
  });
  if (!res.ok) return res;
  await saveCheckout(p, res.id);
  return { ok: true, url: res.url };
}

export async function cashAction(code: string) {
  const p = await loadByCode(code);
  if (!p) return { ok: false, error: "This proposal link isn't valid." };
  return chooseCash(p);
}
