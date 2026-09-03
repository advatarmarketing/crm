"use client";

import { useState } from "react";

export function EditableSelect({
  value,
  options,
  onSave,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSave: (next: string) => Promise<{ error?: string } | void>;
  label?: string;
}) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    const prev = current;
    setCurrent(next); // optimistic
    setError(null);
    const result = await onSave(next);
    if (result?.error) {
      setError(result.error);
      setCurrent(prev);
    }
  }

  return (
    <label style={{ display: "block" }}>
      {label && (
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
          {label}
        </span>
      )}
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: "var(--radius-sm)",
          border: `1px solid ${error ? "var(--status-closed)" : "var(--border)"}`,
          background: "var(--surface-2)",
          color: "var(--text-1)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span style={{ display: "block", fontSize: 11, color: "var(--status-closed)", marginTop: 4 }}>
          Couldn't save: {error}
        </span>
      )}
    </label>
  );
}
