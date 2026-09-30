"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { NoteTodo } from "@/lib/notes";

/**
 * The to-do lists from someone's notes, shown on their To-do tab.
 *
 * These are the SAME rows the Notes tab shows — note_checklist_items —
 * not copies, so ticking one here ticks it there and there is nothing
 * to keep in sync. They are listed separately from the tasks above
 * because they are a different thing: private, with no client and no
 * due date, and nobody else can see them. Mixing them into the shared
 * list would make it look as if the team could.
 *
 * Grouped by the note they came from, with a link back to it, because
 * "Charge batteries" on its own does not say which shoot.
 *
 * Done items fold away under a count rather than sitting struck
 * through forever — a list that only grows stops being read.
 */
export function NoteTodoList({ initial, notesHref }: { initial: NoteTodo[]; notesHref: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(initial);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string, done: boolean) {
    const before = items;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done } : i)));
    setError(null);

    const { error: e } = await supabase.from("note_checklist_items").update({ done }).eq("id", id);
    if (e) {
      setItems(before);
      setError(e.message);
    }
  }

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const shown = showDone ? items : open;

  // Keep the order loadNoteTodos gave (most recently updated note
  // first) and group consecutive items under their note's title.
  const groups: { noteId: string; title: string; items: NoteTodo[] }[] = [];
  for (const item of shown) {
    const last = groups[groups.length - 1];
    if (last && last.noteId === item.note_id) last.items.push(item);
    else groups.push({ noteId: item.note_id, title: item.noteTitle, items: [item] });
  }

  return (
    <div>
      {error && <p style={{ color: "var(--danger-fg)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {open.length === 0 && !showDone ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 10px" }}>
          Nothing outstanding from your notes.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groups.map((g) => (
            <div key={g.noteId}>
              <Link
                href={`${notesHref}?note=${g.noteId}`}
                style={{
                  display: "inline-block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginBottom: 8,
                  textDecoration: "none",
                }}
              >
                {g.title} →
              </Link>

              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {g.items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      opacity: item.done ? 0.55 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(e) => toggle(item.id, e.target.checked)}
                      aria-label={item.done ? `Mark “${item.text}” as not done` : `Mark “${item.text}” as done`}
                      style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--text-1)", cursor: "pointer", flexShrink: 0 }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: "var(--font-body)",
                        fontSize: 13.5,
                        color: "var(--text-1)",
                        textDecoration: item.done ? "line-through" : "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {showDone ? "Hide done" : `Show ${done.length} done`}
        </button>
      )}
    </div>
  );
}
