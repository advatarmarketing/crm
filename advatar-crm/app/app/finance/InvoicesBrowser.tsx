"use client";

import { useMemo, useState } from "react";
import { InvoiceRow, type InvoiceListItem } from "./InvoiceRow";
import { startOfToday } from "@/lib/format";

export type BrowsableInvoice = InvoiceListItem & { clientName: string };

/**
 * Search and status filtering over the invoice list.
 *
 * Same reasoning as the Clients browser: filtering runs over rows the
 * server already fetched under RLS, so this cannot widen what anyone
 * can see — invoices are management-only at the database level
 * (0011_invoices_finance.sql) and a search box never issues a query.
 */
export function InvoicesBrowser({ invoices }: { invoices: BrowsableInvoice[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");

  const today = startOfToday();
  const isOverdue = (r: BrowsableInvoice) =>
    r.status === "sent" && !!r.due_date && new Date(r.due_date) < today;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = invoices.filter((r) => {
      if (status === "open" && r.status === "paid") return false;
      if (status === "overdue" && !isOverdue(r)) return false;
      if (["draft", "sent", "paid"].includes(status) && r.status !== status) return false;
      if (!q) return true;
      return [r.clientName, r.number, r.service]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    // Ordered by what needs chasing: overdue, then owed, then drafts,
    // then settled.
    const rank = (r: BrowsableInvoice) =>
      isOverdue(r) ? 0 : r.status === "sent" ? 1 : r.status === "draft" ? 2 : 3;

    return [...filtered].sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, query, status]);

  return (
    <>
      <div className="filter-bar">
        <input
          className="filter-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search client, invoice number or service…"
          aria-label="Search invoices"
        />

        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="open">Unpaid only</option>
          <option value="overdue">Overdue only</option>
          <option value="draft">Drafts</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="all">All invoices</option>
        </select>

        <span className="filter-count">
          {visible.length === invoices.length
            ? `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`
            : `${visible.length} of ${invoices.length}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          {invoices.length === 0
            ? "No invoices yet. Create one to start tracking what you're owed."
            : "Nothing matches those filters."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              clientName={invoice.clientName}
              overdue={isOverdue(invoice)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
