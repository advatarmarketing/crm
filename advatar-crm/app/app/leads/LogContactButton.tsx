"use client";

import { useState } from "react";
import { logContact } from "./actions";

/**
 * "Logged a call" in one step: stamps today as the contact date and
 * sets the next follow-up, because doing those separately is exactly
 * how follow-ups get forgotten.
 *
 * Defaults the next follow-up to a week out — the common case, and a
 * prefilled sensible date gets set far more often than an empty one.
 */
export function LogContactButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);

  const inAWeek = new Date();
  inAWeek.setDate(inAWeek.getDate() + 7);
  const defaultFollowUp = inAWeek.toISOString().slice(0, 10);

  if (!open) {
    return (
      <button
        type="button"
        className="btn"
        style={{ minHeight: 36, padding: "6px 10px", fontSize: 11 }}
        onClick={() => setOpen(true)}
      >
        Log contact
      </button>
    );
  }

  return (
    <form
      action={logContact}
      onSubmit={() => setOpen(false)}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-2)",
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />

      <label style={{ display: "block" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 4 }}>
          What happened
        </span>
        <input
          name="note"
          placeholder={`Spoke to ${clientName}…`}
          style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
        />
      </label>

      <label style={{ display: "block" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)", display: "block", marginBottom: 4 }}>
          Next follow-up
        </span>
        <input
          name="nextFollowUp"
          type="date"
          defaultValue={defaultFollowUp}
          style={{ width: "100%", padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-1)" }}
        />
      </label>

      <div style={{ display: "flex", gap: 6 }}>
        <button type="submit" className="btn btn-primary" style={{ minHeight: 36, padding: "6px 12px", fontSize: 11 }}>
          Save
        </button>
        <button
          type="button"
          className="btn"
          style={{ minHeight: 36, padding: "6px 12px", fontSize: 11 }}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
