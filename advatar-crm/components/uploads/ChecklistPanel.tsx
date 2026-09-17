"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UploadChecklistItem } from "@/lib/uploads";
import { field, subheading, meta, errorText } from "./styles";

/**
 * The list of things to fix on this cut.
 *
 * Nobody types this. When feedback is posted, a trigger (0028) splits
 * it into items — one per line for a bulleted note, one per sentence
 * for a long paragraph, left whole for anything short. That is the
 * difference between a videographer opening a paragraph and having to
 * re-read it every time they want to know what is left, and opening a
 * list they can tick.
 *
 * Items made from the client's comments are marked as such, because
 * "the client asked for this" and "the reviewer asked for this" are
 * not the same weight of request.
 *
 * `editable` is the videographer: they tick items off and may add one
 * of their own. Deleting is nobody's — a reviewer's request should not
 * be removable by the person it was made of. Ticking it is how you say
 * it is handled, and the record of what was asked stays intact. None
 * of that is enforced here; the policies in 0028 are.
 */
export function ChecklistPanel({
  submissionId,
  items,
  editable,
}: {
  submissionId: string;
  items: UploadChecklistItem[];
  editable: boolean;
}) {
  const [rows, setRows] = useState(items);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const open = rows.filter((r) => !r.done);
  const done = rows.filter((r) => r.done);

  async function toggle(id: string, next: boolean) {
    const before = rows;
    // Optimistic: ticking a box that waits for a round trip feels
    // broken, and the revert below covers the case where it fails.
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, done: next } : r)));

    const { error: updateError } = await supabase
      .from("submission_checklist")
      .update({ done: next, done_at: next ? new Date().toISOString() : null })
      .eq("id", id);

    if (updateError) {
      setRows(before);
      setError(updateError.message);
    }
  }

  async function add() {
    const text = adding.trim();
    if (!text) return;

    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("submission_checklist").insert({
      submission_id: submissionId,
      text,
      // Null on purpose, and required to be null by the policy: an
      // item you added yourself must not look like it came from
      // somebody's note.
      feedback_id: null,
    });

    setBusy(false);
    if (insertError) return setError(insertError.message);

    setAdding("");
    router.refresh();
  }

  if (rows.length === 0 && !editable) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <span style={subheading}>
        Checklist{rows.length > 0 ? ` — ${open.length} of ${rows.length} left` : ""}
      </span>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 10px" }}>
          Nothing to action yet. Items appear here on their own when feedback comes in.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {[...open, ...done].map((item) => (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "9px 11px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: item.done ? "var(--surface-2)" : "var(--surface)",
              }}
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={!editable}
                onChange={(e) => toggle(item.id, e.target.checked)}
                aria-label={item.text}
                style={{ marginTop: 2, accentColor: "var(--accent)", cursor: editable ? "pointer" : "default" }}
              />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-body)",
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: item.done ? "var(--text-3)" : "var(--text-1)",
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {item.text}
                </span>
                <span style={{ ...meta, display: "block", marginTop: 3 }}>
                  {[
                    item.source === "client" ? "asked by the client" : item.feedbackId ? "from review" : "added by you",
                    item.version ? `v${item.version}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Something else you spotted…"
            style={{ ...field, flex: "1 1 200px" }}
          />
          <button type="button" className="btn" onClick={add} disabled={busy || !adding.trim()}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      {error && <p style={errorText}>{error}</p>}
    </div>
  );
}
