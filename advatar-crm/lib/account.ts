import { addDays, todayKey } from "@/lib/videos";

/**
 * Where a client stands with payments (0043), for their Account page,
 * their dashboard and their calendar. Read as the client: RLS returns
 * only their own sent/paid invoices and their own account row.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// Loosely typed on purpose: the hand-written Database type has no
// Functions entry, so a typed client will not accept the rpc call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryableClient = any;

export interface AccountInvoice {
  id: string;
  number: string | null;
  service: string | null;
  amount: number | null;
  due_date: string | null;
  paid_at: string | null;
  status: "sent" | "paid";
}

export interface ClientAccount {
  available: boolean;
  /** No sent invoice is past its due date. */
  upToDate: boolean;
  overdue: AccountInvoice[];
  /** The next thing to pay: an invoice, or the agreed monthly payment day. */
  next: { date: string; amount: number | null; label: string } | null;
  paid: AccountInvoice[];
  note: string | null;
  noteUpdatedAt: string | null;
  billingAmount: number | null;
  billingFrequency: string | null;
  paymentDay: number | null;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(Number(n));
}

/** The next calendar date on `day` of the month, today or later. */
export function nextPaymentDate(day: number, today = todayKey()): string {
  const [y, m, d] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d <= day) return `${y}-${pad(m)}-${pad(day)}`;
  const next = new Date(Date.UTC(y, m, day));
  return next.toISOString().slice(0, 10);
}

export async function loadClientAccount(supabase: QueryableClient, clientId: string): Promise<ClientAccount> {
  const today = todayKey();
  const [inv, acct, summary] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, number, service, amount, due_date, paid_at, status")
      .eq("client_id", clientId)
      .in("status", ["sent", "paid"])
      .order("due_date", { ascending: false, nullsFirst: false }),
    supabase.from("client_accounts").select("payment_day, note, note_updated_at").eq("client_id", clientId).maybeSingle(),
    supabase.rpc ? supabase.rpc("client_account_summary") : Promise.resolve({ data: null, error: null }),
  ]);

  const invoices = ((inv.error ? [] : inv.data) ?? []) as AccountInvoice[];
  const account = (acct.error ? null : acct.data) as { payment_day: number | null; note: string | null; note_updated_at: string | null } | null;
  const sum = (Array.isArray(summary?.data) ? summary.data[0] : summary?.data) as
    | { billing_amount: number | null; billing_frequency: string | null }
    | null
    | undefined;

  const unpaid = invoices.filter((i) => i.status === "sent");
  const overdue = unpaid.filter((i) => i.due_date && i.due_date < today);
  const upcoming = unpaid
    .filter((i) => !i.due_date || i.due_date >= today)
    .sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));

  let next: ClientAccount["next"] = null;
  if (upcoming[0]?.due_date) {
    next = { date: upcoming[0].due_date, amount: upcoming[0].amount, label: upcoming[0].number ? `Invoice ${upcoming[0].number}` : "Invoice" };
  } else if (account?.payment_day && (sum?.billing_frequency ?? "monthly") === "monthly") {
    next = { date: nextPaymentDate(account.payment_day, today), amount: sum?.billing_amount ?? null, label: "Monthly payment" };
  }

  return {
    // The account page is worth showing once any of it exists.
    available: !acct.error || !inv.error,
    upToDate: overdue.length === 0,
    overdue,
    next,
    paid: invoices.filter((i) => i.status === "paid").slice(0, 12),
    note: account?.note?.trim() || null,
    noteUpdatedAt: account?.note_updated_at ?? null,
    billingAmount: sum?.billing_amount ?? null,
    billingFrequency: sum?.billing_frequency ?? null,
    paymentDay: account?.payment_day ?? null,
  };
}

/** Payment dates for a calendar between two days: invoices and the monthly day. */
export function paymentDates(account: ClientAccount, from: string, to: string): { date: string; label: string; overdue: boolean }[] {
  const today = todayKey();
  const out: { date: string; label: string; overdue: boolean }[] = [];
  for (const i of account.overdue) if (i.due_date) out.push({ date: i.due_date, label: `${i.number ? `Invoice ${i.number}` : "Invoice"} ${money(i.amount)} — overdue`, overdue: true });
  const invoiceDays = new Set(out.map((o) => o.date));
  if (account.next && account.next.label.startsWith("Invoice")) {
    out.push({ date: account.next.date, label: `${account.next.label} ${money(account.next.amount)} due`, overdue: false });
    invoiceDays.add(account.next.date);
  }
  if (account.paymentDay && (account.billingFrequency ?? "monthly") === "monthly") {
    let d = nextPaymentDate(account.paymentDay, from > today ? from : today);
    while (d <= to) {
      if (!invoiceDays.has(d)) out.push({ date: d, label: `Monthly payment ${money(account.billingAmount)} due`.replace("  ", " "), overdue: false });
      d = nextPaymentDate(account.paymentDay, addDays(d, 1));
    }
  }
  return out.filter((o) => o.date >= from && o.date <= to);
}
