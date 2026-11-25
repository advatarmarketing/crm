import "server-only";
import crypto from "node:crypto";

/**
 * Taking card payments for proposals through Stripe Checkout.
 *
 * Separate from lib/stripe.ts, which only reads (and refuses a key that
 * can move money). This one needs a key allowed to create checkouts:
 *
 *   STRIPE_CHECKOUT_KEY     a restricted key (rk_...) with write access
 *                           to Checkout Sessions, Products, Prices and
 *                           Customers, and read access to Subscriptions
 *                           and Invoices. A secret key (sk_...) works too.
 *   STRIPE_WEBHOOK_SECRET   the signing secret (whsec_...) of the
 *                           webhook pointing at /api/stripe/webhook
 *
 * Plain fetch, as elsewhere: one form-encoded POST is the whole call.
 * (STRIPE_API_BASE exists only so automated tests can stand in for
 * Stripe. Never set it on the live site.)
 */

export function cardPaymentsOn(): boolean {
  return Boolean(process.env.STRIPE_CHECKOUT_KEY?.trim());
}

export async function createCheckout(opts: {
  plan: "monthly" | "upfront";
  /** In pounds. */
  amount: number;
  email: string;
  productName: string;
  description: string;
  proposalId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string }> {
  const key = process.env.STRIPE_CHECKOUT_KEY?.trim();
  if (!key) return { ok: false, error: "Card payments aren't switched on yet." };
  const pence = Math.round(opts.amount * 100);
  if (!(pence >= 50)) return { ok: false, error: "The amount is too small to take by card." };

  const f = new URLSearchParams();
  f.set("mode", opts.plan === "monthly" ? "subscription" : "payment");
  f.set("customer_email", opts.email);
  f.set("success_url", opts.successUrl);
  f.set("cancel_url", opts.cancelUrl);
  f.set("client_reference_id", opts.proposalId);
  f.set("metadata[proposal_id]", opts.proposalId);
  f.set("line_items[0][quantity]", "1");
  f.set("line_items[0][price_data][currency]", "gbp");
  f.set("line_items[0][price_data][unit_amount]", String(pence));
  f.set("line_items[0][price_data][product_data][name]", opts.productName.slice(0, 200));
  f.set("line_items[0][price_data][product_data][description]", opts.description.slice(0, 500));
  if (opts.plan === "monthly") {
    f.set("line_items[0][price_data][recurring][interval]", "month");
    f.set("subscription_data[metadata][proposal_id]", opts.proposalId);
  } else {
    f.set("payment_intent_data[metadata][proposal_id]", opts.proposalId);
    f.set("invoice_creation[enabled]", "true");
  }

  try {
    const res = await fetch(`${process.env.STRIPE_API_BASE?.trim() || "https://api.stripe.com"}/v1/checkout/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: f.toString(),
    });
    const body = await res.json();
    if (!res.ok) return { ok: false, error: body?.error?.message ?? `Stripe said ${res.status}.` };
    return { ok: true, id: body.id, url: body.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe couldn't be reached." };
  }
}

/**
 * Checks a webhook really came from Stripe (the Stripe-Signature
 * header), and returns the event. Null if it didn't, or is over five
 * minutes old.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function verifyWebhook(raw: string, header: string | null, now = Date.now()): any | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return null;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) return null;
  if (Math.abs(now / 1000 - Number(t)) > 300) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const ok = sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
