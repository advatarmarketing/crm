"use client";

import { useState, useRef, type CSSProperties } from "react";

/**
 * Blur-to-save text field, matching how the original single-file
 * portal behaved: no explicit Save button, edits commit when you
 * click away. Optimistic — the displayed value updates immediately;
 * if the save fails, it reverts and shows an inline error rather than
 * silently losing the edit.
 */
export function EditableField({
  value,
  onSave,
  as = "input",
  placeholder,
  label,
  mono = false,
}: {
  value: string;
  onSave: (next: string) => Promise<{ error?: string } | void>;
  as?: "input" | "textarea";
  placeholder?: string;
  label?: string;
  mono?: boolean;
}) {
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastSaved = useRef(value);

  async function commit() {
    if (current === lastSaved.current) return;
    setSaving(true);
    setError(null);
    const result = await onSave(current);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      setCurrent(lastSaved.current); // revert on failure
    } else {
      lastSaved.current = current;
    }
  }

  const sharedStyle: CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: `1px solid ${error ? "var(--status-closed)" : "var(--border)"}`,
    background: "var(--surface-2)",
    color: "var(--text-1)",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
    fontSize: 14,
    opacity: saving ? 0.7 : 1,
  };

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
      {as === "textarea" ? (
        <textarea
          value={current}
          placeholder={placeholder}
          rows={4}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={commit}
          style={{ ...sharedStyle, resize: "vertical" }}
        />
      ) : (
        <input
          type="text"
          value={current}
          placeholder={placeholder}
          onChange={(e) => setCurrent(e.target.value)}
          onBlur={commit}
          style={sharedStyle}
        />
      )}
      {error && (
        <span style={{ display: "block", fontSize: 11, color: "var(--status-closed)", marginTop: 4 }}>
          Couldn't save: {error}
        </span>
      )}
    </label>
  );
}
