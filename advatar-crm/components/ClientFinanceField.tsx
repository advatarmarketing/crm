"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

export type BillingFrequency = "monthly" | "quarterly" | "annual" | "per_project" | "one_off";

const FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly retainer" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "per_project", label: "Per project" },
  { value: "one_off", label: "One-off" },
];

// Mirrors the trigger in 0015_billing_agreements.sql. Shown so you can
// see what a non-monthly agreement contributes to recurring revenue
// before you save it — the database is still what actually computes
// and stores the figure.
function monthlyEquivalent(amount: number | null, frequency: BillingFrequency | ""): number | null {
  if (amount === null || !frequency) return null;
  if (frequency === "monthly") return amount;
  if (frequency === "quarterly") return amount / 3;
  if (frequency === "annual") return amount / 12;
  return 0;
}

/**
 * The client's payment agreement.
 *
 * Only ever rendered when the server component fetched a
 * client_finance row, i.e. only for a CEO session — that's the only
 * role RLS lets read this table. No role check lives in this
 * component.
 */
export function ClientFinanceField({
  clientId,
  initialValue,
  initialAmount,
  initialFrequency,
  initialNotes,
}: {
  clientId: string;
  /** Legacy monthly figure — now derived from the two fields below. */
  initialValue: number | null;
  initialAmount?: number | null;
  initialFrequency?: BillingFrequency | null;
  initialNotes?: string | null;
}) {
  const [amount, setAmount] = useState(
    initialAmount !== null && initialAmount !== undefined
      ? String(initialAmount)
      : initialValue !== null
        ? String(initialValue)
        : ""
  );
  const [frequency, setFrequency] = useState<BillingFrequency | "">(
    initialFrequency ?? (initialValue !== null ? "monthly" : "")
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const supabase = createClient();

  async function commit(next?: { frequency?: BillingFrequency | ""; notes?: string }) {
    const freq = next?.frequency ?? frequency;
    const note = next?.notes ?? notes;

    const parsed = amount.trim() === "" ? null : Number(amount);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setError("Enter a positive number.");
      return;
    }

    setError(null);
    const { error: upsertError } = await supabase.from("client_finance").upsert({
      client_id: clientId,
      billing_amount: parsed,
      billing_frequency: freq || null,
      billing_notes: note.trim() || null,
    });

    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const preview = monthlyEquivalent(amount.trim() === "" ? null : Number(amount), frequency);

  return (
    <div>
      <div className="row-2" style={{ marginBottom: 10 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Amount (£)</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => commit()}
            placeholder="0"
            style={{
              ...inputStyle,
              borderColor: error ? "var(--status-closed)" : "var(--border)",
            }}
          />
        </label>

        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>How they pay</span>
          <select
            value={frequency}
            onChange={(e) => {
              const next = e.target.value as BillingFrequency | "";
              setFrequency(next);
              commit({ frequency: next });
            }}
            style={inputStyle}
          >
            <option value="">Not set</option>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={labelStyle}>Agreement notes</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => commit()}
          placeholder="e.g. 3 shoot days a quarter, invoiced in advance"
          style={inputStyle}
        />
      </label>

      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", margin: 0 }}>
        {preview === null
          ? "No agreement recorded yet."
          : preview === 0
            ? "Counts as project work, not recurring revenue."
            : `Counts as ${formatMoney(preview)}/month towards recurring revenue.`}
        {saved && <span style={{ color: "var(--status-active)" }}> · Saved</span>}
      </p>

      {error && (
        <p style={{ fontSize: 11, color: "var(--status-closed)", margin: "4px 0 0" }}>
          Couldn&apos;t save: {error}
        </p>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase" as const,
  color: "var(--text-3)",
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
};
