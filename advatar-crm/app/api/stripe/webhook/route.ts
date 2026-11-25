import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/stripe-checkout";
import { cardPaid, monthlyCardPaid } from "@/lib/proposals/server";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

/**
 * Stripe tells us here when a proposal has been paid (0057).
 *
 * - checkout.session.completed: the first payment. Marks the proposal
 *   paid and sets the client up (client record, invoice, login).
 * - invoice.paid on a subscription's later months: noted as a monthly
 *   payment on the proposal.
 *
 * Every event is checked against STRIPE_WEBHOOK_SECRET first. Stripe
 * retries anything that doesn't get a 200, and repeats are harmless.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const event = verifyWebhook(raw, request.headers.get("stripe-signature"));
  if (!event) return NextResponse.json({ error: "bad signature" }, { status: 400 });

  const origin = siteUrl() ?? new URL(request.url).origin;
  try {
    const obj = event.data?.object ?? {};
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const proposalId = obj.metadata?.proposal_id ?? obj.client_reference_id;
      if (proposalId && (obj.payment_status === "paid" || obj.payment_status === "no_payment_required")) {
        await cardPaid(proposalId, obj.id, obj.amount_total ?? 0, typeof obj.subscription === "string" ? obj.subscription : null, origin);
      }
    } else if (event.type === "invoice.paid" && obj.billing_reason === "subscription_cycle") {
      const sub = typeof obj.subscription === "string" ? obj.subscription : obj.parent?.subscription_details?.subscription;
      if (sub) await monthlyCardPaid(sub, obj.id, obj.amount_paid ?? 0);
    }
  } catch (e) {
    console.error("[stripe/webhook]", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
