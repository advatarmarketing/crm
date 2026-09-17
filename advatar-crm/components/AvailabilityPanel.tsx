"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * When someone is free, in their own words.
 *
 * Free text rather than a weekly grid, and deliberately so: real
 * availability is "weekdays after 4, all day Saturday, away the third
 * week of August", and a grid forces people to leave out the exception
 * that actually matters. Nothing computes against this — the person
 * booking reads it and books around it.
 *
 * Written straight through the browser client, so `profiles`' RLS
 * decides whether it lands: "update own" for the person themselves,
 * "management update any" (0022) for a CEO or operations manager
 * filling it in on somebody's behalf. `editable` only draws the
 * controls.
 */
export function AvailabilityPanel({
  profileId,
  initialValue,
  editable = true,
  emptyMessage = "Nothing written down yet.",
}: {
  profileId: string;
  initialValue: string | null;
  editable?: boolean;
  emptyMessage?: string;
}) {
  const [saved, setSaved] = useState(initialValue ?? "");
  const [draft, setDraft] = useState(initialValue ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  async function save() {
    setBusy(true);
    setError(null);

    const value = draft.trim();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ availability: value || null })
      .eq("id", profileId);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSaved(value);
    setEditing(false);
    setJustSaved(true);
    router.refresh();
  }

  if (!editing) {
    return (
      <div>
        {saved ? (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--text-1)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              margin: 0,
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
            }}
          >
            {saved}
          </p>
        ) : (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
            {emptyMessage}
          </p>
        )}

        {editable && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraft(saved);
                setJustSaved(false);
                setEditing(true);
              }}
            >
              {saved ? "Edit availability" : "+ Add your availability"}
            </button>
            {justSaved && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--ok-fg)" }}>
                Saved
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        autoFocus
        placeholder={
          "e.g. Mon–Thu from 4pm, all day Fri and Sat.\nNot available Sundays.\nAway 12–19 August."
        }
        style={{
          width: "100%",
          padding: "11px 13px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-1)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
          lineHeight: 1.6,
          resize: "vertical",
        }}
      />

      <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: "8px 0 12px" }}>
        Whoever books your work reads this. Days and times are most useful,
        plus anything you already know you can&rsquo;t do.
      </p>

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary">
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setDraft(saved);
            setError(null);
          }}
          className="btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
