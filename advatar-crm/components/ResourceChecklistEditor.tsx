"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface EditableStep {
  id: string;
  text: string;
  position: number;
}

/**
 * The steps management writes into an SOP, which videographers then
 * tick through on the Guidelines page.
 *
 * Only management can write here (0021) — the people doing the work
 * tick their own copy but never change the standard itself. Deleting
 * a step also removes everyone's tick for it, by the cascade on
 * resource_checklist_progress.
 *
 * Steps are added one line at a time, and a whole list can be pasted
 * in at once: writing an SOP usually means pasting the steps you
 * already have somewhere else, not typing them in one by one.
 */
export function ResourceChecklistEditor({
  resourceId,
  initialSteps,
  autoFocus = false,
}: {
  resourceId: string;
  initialSteps: EditableStep[];
  /** Set right after an SOP is created, so the checklist is the
   * obvious next thing to fill in rather than a hidden extra. */
  autoFocus?: boolean;
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  async function addSteps() {
    // A pasted block becomes one step per line, with bullet
    // characters and numbering stripped — that's how the text
    // arrives from a doc.
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    setBusy(true);
    setError(null);

    const rows = lines.map((line, i) => ({
      resource_id: resourceId,
      text: line,
      position: steps.length + i,
    }));

    const { data, error: insertError } = await supabase
      .from("resource_checklist_items")
      .insert(rows)
      .select("id, text, position");

    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not add those.");
      return;
    }

    setSteps((prev) => [...prev, ...(data as EditableStep[])]);
    setText("");
    router.refresh();
  }

  async function remove(id: string) {
    const prev = steps;
    setSteps((ss) => ss.filter((s) => s.id !== id)); // optimistic

    const { error: deleteError } = await supabase.from("resource_checklist_items").delete().eq("id", id);
    if (deleteError) {
      setSteps(prev);
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 8,
        }}
      >
        Checklist steps {steps.length > 0 ? `(${steps.length})` : ""}
      </span>

      {steps.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: "0 0 10px" }}>
          No steps yet. Add them below and this SOP becomes a checklist people
          can tick through while editing.
        </p>
      ) : (
        <ol style={{ margin: "0 0 10px", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {steps.map((s) => (
            <li key={s.id} style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-1)" }}>
              <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, width: "100%" }}>
                <span style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>{s.text}</span>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  aria-label={`Remove step: ${s.text}`}
                  title="Remove"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-3)",
                    cursor: "pointer",
                    padding: "0 2px",
                    fontSize: 14,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={autoFocus}
        rows={3}
        placeholder={"One step per line — paste a whole list if you have one.\nCheck the brief\nColour grade\nExport at 4K"}
        style={{ ...field, width: "100%", resize: "vertical", marginBottom: 8 }}
      />

      <button type="button" onClick={addSteps} disabled={busy || !text.trim()} className="btn">
        {busy ? "Adding…" : "Add steps"}
      </button>

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

const field = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  minWidth: 0,
};
