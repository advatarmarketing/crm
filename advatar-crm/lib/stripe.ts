import "server-only";

/**
 * A read-only look at Stripe, for the CEO's Finance page.
 *
 * Uses a RESTRICTED key (Stripe dashboard → Developers → API keys →
 * "Create restricted key") with Read access to Balance, Charges and
 * Payouts and nothing else, saved in Vercel as STRIPE_RESTRICTED_KEY.
 * This code only ever reads; a restricted key means that even a bug
 * here could not move money.
 *
 * Plain fetch rather than the Stripe SDK: three GET requests do not
 * justify a dependency.
 */

export const STRIPE_KEY_ENV = "STRIPE_RESTRICTED_KEY";

export interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  created: number;
  status: string;
  paid: boolean;
  refunded: boolean;
  description: string | null;
  customerEmail: string | null;
  customerName: string | null;
}

export interface StripeOverview {
  state: "no-key" | "secret-key" | "error" | "ok";
  message?: string;
  available?: { amount: number; currency: string }[];
  pending?: { amount: number; currency: string }[];
  charges?: StripeCharge[];
  payouts?: { id: string; amount: number; currency: string; arrival_date: number; status: string }[];
}

async function get(path: string, key: string): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    // Fresh on every visit; this page is opened to see what came in.
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe said ${res.status}`);
  return body;
}

export async function loadStripeOverview(): Promise<StripeOverview> {
  const key = (process.env[STRIPE_KEY_ENV] ?? "").trim();
  if (!key) return { state: "no-key" };
  // A full secret key can move money. Refuse it, so nobody pastes one
  // in thinking it is the same thing.
  if (/^sk_/.test(key)) return { state: "secret-key" };

  try {
    const [balance, charges, payouts] = await Promise.all([
      get("balance", key),
      get("charges?limit=15", key),
      get("payouts?limit=5", key).catch(() => ({ data: [] })),
    ]);
    return {
      state: "ok",
      available: balance.available ?? [],
      pending: balance.pending ?? [],
      charges: ((charges.data ?? []) as any[]).map((c) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        created: c.created,
        status: c.status,
        paid: c.paid,
        refunded: c.refunded,
        description: c.description ?? null,
        customerEmail: c.billing_details?.email ?? c.receipt_email ?? null,
        customerName: c.billing_details?.name ?? null,
      })),
      payouts: ((payouts.data ?? []) as any[]).map((p) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        arrival_date: p.arrival_date,
        status: p.status,
      })),
    };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "Stripe could not be reached." };
  }
}

/** Stripe amounts are in the smallest unit (pence). */
export function stripeMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}
