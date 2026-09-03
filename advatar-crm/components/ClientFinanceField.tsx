"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Only ever rendered when the server component fetched a
 * client_finance row for this client — i.e. only for a ceo session,
 * because that's the only session RLS lets read client_finance at
 * all (Phase 4). No role check lives in this component.
 */
export function ClientFinanceField({
  clientId,
  initialValue,
}: {
  clientId: string;
  initialValue: number | null;
}) {
  const [value, setValue] = useState(initialValue !== null ? String(initialValue) : "");
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function commit() {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && Number.isNaN(parsed)) {
      setError("Enter a number.");
      return;
    }
    setError(null);
    const { error: upsertError } = await supabase
      .from("client_finance")
      .upsert({ client_id: clientId, monthly_value: parsed });
    if (upsertError) setError(upsertError.message);
  }

  return (
    <label style={{ display: "block", maxWidth: 200 }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 6,
        }}
      >
        Monthly value (£)
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${error ? "var(--status-closed)" : "var(--border)"}`,
          background: "var(--surface-2)",
          color: "var(--text-1)",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
        }}
      />
      {error && (
        <span style={{ display: "block", fontSize: 11, color: "var(--status-closed)", marginTop: 4 }}>
          Couldn't save: {error}
        </span>
      )}
    </label>
  );
}
