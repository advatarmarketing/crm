"use client";

import { useState } from "react";
import { saveClientAccountAction } from "@/app/app/clients/[id]/account-actions";

/**
 * What the client sees on their Account page, set from here (0043):
 * the day their payment is due each month, and a note from the team.
 * Whether each payment has arrived is ticked on the invoice itself,
 * in Finance below.
 */
export function ClientAccountPanel({
  clientId,
  clientName,
  initialDay,
  initialNote,
  available,
}: {
  clientId: string;
  clientName: string;
  initialDay: number | null;
  initialNote: string | null;
  available: boolean;
}) {
  const [day, setDay] = useState(initialDay ? String(initialDay) : "");
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!available) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>
        The client’s Account page isn’t switched on yet — database update 0043 still needs running.
      </p>
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await saveClientAccountAction(clientId, day.trim() ? Number(day) : null, note);
    setBusy(false);
    setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: `Saved. ${clientName} sees this on their Account page.` });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
        Payment due on day
        <input
          type="number"
          min={1}
          max={28}
          value={day}
          onChange={(e) => setDay(e.target.value)}
          placeholder="—"
          style={{ width: 80 }}
          aria-label="Payment day of the month"
        />
        <span style={{ color: "var(--text-3)", fontSize: 12.5 }}>of each month (shows on their calendar)</span>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
        Note to the client about payments
        <textarea
          rows={3}
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. All up to date — thank you. Or: we haven’t received November’s payment yet, could you check?"
        />
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && (
          <span role={msg.ok ? "status" : "alert"} style={{ fontSize: 13, color: msg.ok ? "var(--text-2)" : "var(--danger-fg)" }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
