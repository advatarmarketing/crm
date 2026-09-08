"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ChecklistStep {
  id: string;
  text: string;
  position: number;
  /** This viewer's own tick state, not anyone else's. */
  done: boolean;
}

export interface SopWithChecklist {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  body: string | null;
  steps: ChecklistStep[];
}

/**
 * An SOP you can work through while editing, then reset for the next
 * video.
 *
 * The ticks live in resource_checklist_progress keyed on
 * (user_id, item_id), so they are this person's working state for the
 * video they are on right now — two videographers using the same SOP
 * never see each other's progress, and "Uncheck all" clears only
 * theirs. The steps themselves are written by management and are
 * read-only here; an SOP everyone can edit isn't a standard.
 */
export function SopChecklist({
  sop,
  userId,
  defaultOpen = false,
}: {
  sop: SopWithChecklist;
  userId: string;
  defaultOpen?: boolean;
}) {
  const [steps, setSteps] = useState(sop.steps);
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const complete = total > 0 && doneCount === total;

  async function toggle(itemId: string, done: boolean) {
    const prev = steps;
    setSteps((ss) => ss.map((s) => (s.id === itemId ? { ...s, done } : s))); // optimistic
    setError(null);

    // upsert: the row may not exist yet — a step nobody has ticked
    // has no progress row at all, which keeps the table to only what
    // has actually been touched.
    const { error: saveError } = await supabase
      .from("resource_checklist_progress")
      .upsert({ user_id: userId, item_id: itemId, done }, { onConflict: "user_id,item_id" });

    if (saveError) {
      setSteps(prev);
      setError(saveError.message);
    }
  }

  async function uncheckAll() {
    const prev = steps;
    setSteps((ss) => ss.map((s) => ({ ...s, done: false }))); // optimistic
    setBusy(true);
    setError(null);

    // Delete rather than set false: no row means not done, so this
    // leaves the table holding only live working state.
    const { error: deleteError } = await supabase
      .from("resource_checklist_progress")
      .delete()
      .eq("user_id", userId)
      .in(
        "item_id",
        steps.map((s) => s.id)
      );

    setBusy(false);

    if (deleteError) {
      setSteps(prev);
      setError(deleteError.message);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${complete ? "#5c8a52" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
              minWidth: 0,
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: "var(--text-3)", fontSize: 12, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 600, color: "var(--text-1)" }}>
              {sop.title}
            </span>
          </button>

          {total > 0 && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: complete ? "#5c8a52" : "var(--text-3)",
                flexShrink: 0,
              }}
            >
              {doneCount}/{total} {complete ? "· done" : ""}
            </span>
          )}

          {sop.url && (
            <a
              href={sop.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ textDecoration: "none", flexShrink: 0 }}
            >
              Open ↗
            </a>
          )}
        </div>

        {/* Progress bar. At a glance while editing, the count alone is
            harder to read than a filled line. */}
        {total > 0 && (
          <div
            aria-hidden="true"
            style={{
              height: 4,
              borderRadius: 2,
              background: "var(--surface-2)",
              marginTop: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(doneCount / total) * 100}%`,
                height: "100%",
                background: complete ? "#5c8a52" : "var(--text-2)",
                transition: "width .15s",
              }}
            />
          </div>
        )}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "12px 14px" }}>
          {sop.body && (
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--text-2)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                margin: "0 0 14px",
              }}
            >
              {sop.body}
            </p>
          )}

          {total === 0 ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
              No checklist steps on this one yet.
            </p>
          ) : (
            <>
              <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                {steps.map((s) => (
                  <li key={s.id}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "8px 6px",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        opacity: s.done ? 0.55 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={(e) => toggle(s.id, e.target.checked)}
                        style={{
                          width: 17,
                          height: 17,
                          marginTop: 1,
                          accentColor: "var(--text-1)",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 13.5,
                          color: "var(--text-1)",
                          lineHeight: 1.5,
                          textDecoration: s.done ? "line-through" : "none",
                        }}
                      >
                        {s.text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <button type="button" onClick={uncheckAll} disabled={busy || doneCount === 0} className="btn">
                {busy ? "Clearing…" : "Uncheck all — start the next video"}
              </button>
            </>
          )}

          {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, marginTop: 10 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
