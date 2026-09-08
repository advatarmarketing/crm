"use client";

import { useState } from "react";

/**
 * Shows a temporary password once, with a copy button.
 *
 * It is shown rather than emailed on purpose (see createLogin's note),
 * and it is never stored — once this notice is gone the only way back
 * is to reset the password, which issues a new one. The wording says
 * so, because a password that looks retrievable and isn't causes a
 * support call later.
 */
export function TempPasswordNotice({
  message,
  password,
}: {
  message: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some browsers/contexts — the password
      // is on screen anyway, so this is not worth an error message.
    }
  }

  return (
    <div
      style={{
        margin: "0 0 16px",
        padding: "14px 16px",
        border: "1px solid var(--status-active, var(--border))",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-2)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)" }}>
        {message}
      </p>

      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 6,
        }}
      >
        Temporary password
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <code
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 18,
            letterSpacing: "0.02em",
            color: "var(--text-1)",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
            userSelect: "all",
          }}
        >
          {password}
        </code>
        <button type="button" onClick={copy} className="btn" style={{ flexShrink: 0 }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p style={{ margin: "10px 0 0", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
        Write this down or send it to them now — it is not saved anywhere and
        will not be shown again. They sign in with it, then change it under
        Settings → Password. If it gets lost, use Reset password below to issue
        a new one.
      </p>
    </div>
  );
}
