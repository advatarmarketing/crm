"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { addPayment, type AddPaymentState } from "./actions";
import { displayName } from "@/lib/names";

const initialState: AddPaymentState = { error: null, success: false };

export function AddPaymentForm({ staff }: { staff: { id: string; fullName: string | null; role: string }[] }) {
  const [state, formAction] = useFormState(addPayment, initialState);

  return (
    <form
      action={formAction}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 140px 1fr 160px auto",
        gap: 10,
        alignItems: "end",
        marginBottom: 28,
        padding: 16,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
      }}
    >
      <Field label="Staff member">
        <select name="staffId" required style={inputStyle}>
          <option value="">Select…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {`${displayName(s.fullName)} (${s.role})`}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Amount (£)">
        <input name="amount" type="number" step="0.01" min="0.01" required style={inputStyle} />
      </Field>

      <Field label="Note">
        <input name="note" type="text" placeholder="Optional" style={inputStyle} />
      </Field>

      <Field label="Date">
        <input name="paidOn" type="date" required style={inputStyle} />
      </Field>

      <SubmitButton />

      {state.error && (
        <span style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--status-closed)" }}>{state.error}</span>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "9px 18px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--text-1)",
        background: "var(--text-1)",
        color: "var(--bg)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Adding…" : "Add"}
    </button>
  );
}
