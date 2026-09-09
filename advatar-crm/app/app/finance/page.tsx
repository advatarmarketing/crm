import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import type { InvoiceListItem } from "./InvoiceRow";
import { InvoicesBrowser, type BrowsableInvoice } from "./InvoicesBrowser";
import { formatMoney } from "@/lib/format";
import { startOfToday } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Finance — money coming IN. (The separate "Payments" screen is money
 * going out to staff.)
 *
 * CEO + operations manager, gated here for a clean redirect and by
 * "invoices: management full access" RLS
 * (0011_invoices_finance.sql) for real.
 *
 * The monthly-recurring tile is an exception within that: it reads
 * `client_finance`, which is still CEO-only, so an operations manager
 * simply gets no rows back and the tile doesn't render. That's the
 * same pattern the client cards already use for the £ figure — no
 * `role === 'ceo'` branch in the markup, the data just isn't there.
 */
export default async function FinancePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const [{ data: invoices }, { data: finance }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, client_id, number, service, amount, invoice_date, due_date, paid_at, status, clients(name)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("client_finance").select("monthly_value"),
  ]);

  type Row = InvoiceListItem & { clients: { name: string } | null };
  const rows = (invoices ?? []) as unknown as Row[];

  const today = startOfToday();
  const isOverdue = (r: Row) => r.status === "sent" && !!r.due_date && new Date(r.due_date) < today;

  const browsable: BrowsableInvoice[] = rows.map((r) => ({
    ...r,
    clientName: r.clients?.name ?? "Unknown client",
  }));

  const outstanding = rows
    .filter((r) => r.status === "sent")
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const overdue = rows.filter(isOverdue).reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const paidThisMonth = rows
    .filter((r) => r.status === "paid" && r.paid_at && new Date(r.paid_at) >= monthStart)
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const mrr = (finance ?? []).reduce((sum, f) => sum + (f.monthly_value ?? 0), 0);

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Finance</h1>
        <Link href="/app/finance/new" className="btn btn-accent">
          + New invoice
        </Link>
      </div>

      <div className="stat-row">
        <StatTile label="Outstanding" value={formatMoney(outstanding)} hint="sent, not yet paid" />
        {/* Overdue is the one number on this page that means someone
            has to pick up the phone, so it is the only one that turns
            red — and only when there is actually something in it. */}
        <StatTile
          label="Overdue"
          value={formatMoney(overdue)}
          tone={overdue > 0 ? "danger" : "ok"}
          hint={overdue > 0 ? "past the due date" : "nothing late"}
        />
        <StatTile label="Paid this month" value={formatMoney(paidThisMonth)} tone="ok" />
        {(finance ?? []).length > 0 && (
          <StatTile label="Monthly recurring" value={formatMoney(mrr)} tone="accent" hint="contracted per month" />
        )}
      </div>

      <InvoicesBrowser invoices={browsable} />
    </main>
  );
}
