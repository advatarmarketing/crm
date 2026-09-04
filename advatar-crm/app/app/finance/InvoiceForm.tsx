"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import Link from "next/link";
import { saveInvoice, type InvoiceFormState } from "./actions";
import type { InvoiceStatus } from "@/lib/supabase/types";

const initialState: InvoiceFormState = { error: null };

export interface InvoiceFormValues {
  id?: string;
  client_id?: string;
  number?: string | null;
  service?: string | null;
  amount?: number | null;
  invoice_date?: string | null;
  due_date?: string | null;
  status?: InvoiceStatus | null;
}

/** One form for both creating and editing — an id means edit. */
export function InvoiceForm({
  clients,
  invoice,
}: {
  clients: { id: string; name: string }[];
  invoice?: InvoiceFormValues;
}) {
  const [state, formAction] = useFormState(saveInvoice, initialState);

  // `<input type="date">` only accepts YYYY-MM-DD; a timestamp from
  // the database would silently render as an empty field.
  const dateValue = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

  return (
    <form action={formAction}>
      {invoice?.id && <input type="hidden" name="invoiceId" value={invoice.id} />}

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Client</span>
        <select name="clientId" required defaultValue={invoice?.client_id ?? ""} style={inputStyle}>
          <option value="" disabled>
            Choose a client…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="row-2" style={{ marginBottom: 16 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Invoice number</span>
          <input name="number" defaultValue={invoice?.number ?? ""} style={inputStyle} placeholder="e.g. INV-014" />
        </label>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Amount (£)</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={invoice?.amount ?? ""}
            style={inputStyle}
            placeholder="0.00"
          />
        </label>
      </div>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Service</span>
        <input
          name="service"
          defaultValue={invoice?.service ?? ""}
          style={inputStyle}
          placeholder="e.g. Monthly retainer, Shoot day"
        />
      </label>

      <div className="row-2" style={{ marginBottom: 16 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Invoice date</span>
          <input name="invoiceDate" type="date" defaultValue={dateValue(invoice?.invoice_date)} style={inputStyle} />
        </label>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Due date</span>
          <input name="dueDate" type="date" defaultValue={dateValue(invoice?.due_date)} style={inputStyle} />
        </label>
      </div>

      <label style={{ display: "block", marginBottom: 24 }}>
        <span style={labelStyle}>Status</span>
        <select name="status" defaultValue={invoice?.status ?? "draft"} style={inputStyle}>
          <option value="draft">Draft — not sent yet</option>
          <option value="sent">Sent — waiting to be paid</option>
          <option value="paid">Paid</option>
        </select>
      </label>

      {state.error && (
        <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 16 }}>{state.error}</p>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <SubmitButton isEdit={!!invoice?.id} />
        <Link href="/app/finance" className="btn">
          Cancel
        </Link>
      </div>
    </form>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "12px 24px",
        minHeight: 44,
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: "var(--text-1)",
        color: "var(--bg)",
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        fontSize: 14,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Saving…" : isEdit ? "Save changes" : "Create invoice"}
    </button>
  );
}
