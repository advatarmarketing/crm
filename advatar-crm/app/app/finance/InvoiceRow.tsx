"use client";

import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { markInvoicePaid, markInvoiceSent } from "./actions";
import type { InvoiceStatus } from "@/lib/supabase/types";

export interface InvoiceListItem {
  id: string;
  client_id: string;
  number: string | null;
  service: string | null;
  amount: number | null;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  status: InvoiceStatus | null;
}

function StatusPill({ status, overdue }: { status: InvoiceStatus | null; overdue: boolean }) {
  const label = overdue ? "overdue" : status ?? "draft";
  const color = overdue
    ? "var(--status-closed)"
    : status === "paid"
      ? "var(--status-active)"
      : status === "sent"
        ? "var(--status-warm)"
        : "var(--text-3)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        borderRadius: 20,
        padding: "3px 10px",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

/**
 * One invoice in the finance list. A server component so the
 * mark-paid / mark-sent buttons can post straight to a server action
 * with no client JavaScript — the whole row is a couple of forms.
 */
export function InvoiceRow({
  invoice,
  clientName,
  overdue,
}: {
  invoice: InvoiceListItem;
  clientName: string;
  overdue: boolean;
}) {
  return (
    <li
      className="lead-row"
      style={{
        gap: 16,
        padding: "14px 16px",
        border: `1px solid ${overdue ? "var(--status-closed)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--text-1)" }}>
            {clientName}
          </span>
          <StatusPill status={invoice.status} overdue={overdue} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text-1)" }}>
            {formatMoney(invoice.amount)}
          </span>
        </div>

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
          {[invoice.number ? `#${invoice.number}` : null, invoice.service].filter(Boolean).join(" · ") ||
            "No reference"}
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: overdue ? "var(--status-closed)" : "var(--text-3)",
            marginTop: 4,
          }}
        >
          {invoice.status === "paid"
            ? `Paid ${formatDate(invoice.paid_at)}`
            : invoice.due_date
              ? `${overdue ? "Was due" : "Due"} ${formatDate(invoice.due_date)}`
              : `Issued ${formatDate(invoice.invoice_date)}`}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        <Link href={`/app/finance/${invoice.id}`} className="btn">
          Edit
        </Link>

        {invoice.status === "draft" && (
          <form action={markInvoiceSent}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className="btn">
              Mark sent
            </button>
          </form>
        )}

        {invoice.status !== "paid" && (
          <form action={markInvoicePaid}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className="btn btn-primary">
              Mark paid
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
