import Link from "next/link";
import { formatDate, formatMoney, startOfToday } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/supabase/types";

export interface ClientInvoice {
  id: string;
  number: string | null;
  service: string | null;
  amount: number | null;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  status: InvoiceStatus | null;
}

/**
 * One client's invoices, shown on their detail page.
 *
 * There is no role check in here. `invoices` is management-only under
 * RLS (0011_invoices_finance.sql), so a staff or videographer session's
 * query returns an empty array and the client detail page doesn't
 * render this section at all — the same way the £ monthly value has
 * always worked on the client cards.
 */
export function ClientFinancePanel({
  clientId,
  invoices,
}: {
  clientId: string;
  invoices: ClientInvoice[];
}) {
  const today = startOfToday();
  const isOverdue = (i: ClientInvoice) =>
    i.status === "sent" && !!i.due_date && new Date(i.due_date) < today;

  const outstanding = invoices
    .filter((i) => i.status === "sent")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const billedTotal = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Outstanding
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-1)" }}>
            {formatMoney(outstanding)}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
            Paid to date
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-1)" }}>
            {formatMoney(billedTotal)}
          </div>
        </div>
      </div>

      {invoices.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          No invoices for this client yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map((invoice) => {
            const overdue = isOverdue(invoice);
            const label = overdue ? "overdue" : invoice.status ?? "draft";
            const color = overdue
              ? "var(--status-closed)"
              : invoice.status === "paid"
                ? "var(--status-active)"
                : invoice.status === "sent"
                  ? "var(--status-warm)"
                  : "var(--text-3)";

            return (
              <li
                key={invoice.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/app/finance/${invoice.id}`}
                    style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-1)", textDecoration: "none" }}
                  >
                    {formatMoney(invoice.amount)}
                    {invoice.number ? ` · #${invoice.number}` : ""}
                  </Link>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
                    {invoice.status === "paid"
                      ? `Paid ${formatDate(invoice.paid_at)}`
                      : invoice.due_date
                        ? `${overdue ? "Was due" : "Due"} ${formatDate(invoice.due_date)}`
                        : formatDate(invoice.invoice_date)}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color,
                    border: `1px solid ${color}`,
                    borderRadius: 20,
                    padding: "3px 9px",
                    flexShrink: 0,
                  }}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Link href={`/app/finance/new?client=${clientId}`} className="btn">
        + New invoice
      </Link>
    </div>
  );
}
