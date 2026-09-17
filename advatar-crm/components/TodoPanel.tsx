"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ClientChoice } from "./SchedulePanel";

export interface TodoEntry {
  id: string;
  text: string;
  due_date: string | null;
  done: boolean;
  client_id: string | null;
  assigned_to: string | null;
  clientName?: string | null;
  personName?: string | null;
}

/**
 * Ticking, adding and removing to-dos. Same pattern as SchedulePanel:
 * writes go through the browser client so `tasks` RLS (0002/0010)
 * decides what is allowed, and `editable` only governs the controls.
 *
 * A to-do is a `tasks` row — the same table the client detail page
 * and dashboard already use — so anything added here shows up
 * wherever that client's tasks are listed, rather than living in a
 * parallel list of its own.
 */
export function TodoPanel({
  initialTasks,
  editable = true,
  defaultAssignee = null,
  clients = [],
  emptyMessage = "Nothing outstanding.",
  showPerson = false,
  showClientLink = true,
  canTick = true,
}: {
  initialTasks: TodoEntry[];
  editable?: boolean;
  defaultAssignee?: string | null;
  clients?: ClientChoice[];
  emptyMessage?: string;
  showPerson?: boolean;
  showClientLink?: boolean;
  /**
   * Separate from `editable`, which only governs add and delete: a
   * videographer may tick but not add (0019), and a client login has
   * no update policy on `tasks` at all. Where ticking would fail, the
   * box is disabled rather than left looking live and snapping back.
   */
  canTick?: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const visible = showDone ? tasks : open;

  async function toggle(id: string, nextDone: boolean) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: nextDone } : t))); // optimistic
    const { error: updateError } = await supabase.from("tasks").update({ done: nextDone }).eq("id", id);
    if (updateError) {
      setTasks(prev);
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("tasks")
      .insert({
        text: text.trim(),
        due_date: due || null,
        client_id: clientId || null,
        assigned_to: defaultAssignee,
        done: false,
      })
      .select("id, text, due_date, done, client_id, assigned_to")
      .single();

    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not add that.");
      return;
    }

    const clientName = clients.find((c) => c.id === clientId)?.name ?? null;
    setTasks((prev) => [...prev, { ...(data as TodoEntry), clientName }]);
    setText("");
    setDue("");
    setClientId("");
    router.refresh();
  }

  async function remove(id: string) {
    const prev = tasks;
    setTasks((ts) => ts.filter((t) => t.id !== id)); // optimistic
    const { error: deleteError } = await supabase.from("tasks").delete().eq("id", id);
    if (deleteError) {
      setTasks(prev);
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {visible.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          {emptyMessage}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {visible.map((t) => {
            const overdue = !t.done && t.due_date && new Date(t.due_date) < startOfToday();
            return (
              <li
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  // Overdue is the only state that tints. A to-do list
                  // where every row is coloured tells you nothing.
                  background: overdue ? "var(--danger-bg)" : "var(--surface)",
                  border: `1px solid ${overdue ? "var(--danger-border)" : "var(--border)"}`,
                  opacity: t.done ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={!canTick}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                  aria-label={
                    canTick
                      ? t.done
                        ? `Mark "${t.text}" as not done`
                        : `Mark "${t.text}" as done`
                      : `${t.text} — ${t.done ? "done" : "outstanding"}`
                  }
                  style={{
                    width: 16,
                    height: 16,
                    marginTop: 2,
                    accentColor: "var(--text-1)",
                    cursor: canTick ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                />

                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13.5,
                      color: "var(--text-1)",
                      textDecoration: t.done ? "line-through" : "none",
                    }}
                  >
                    {t.text}
                  </span>

                  {(t.due_date || t.clientName || (showPerson && t.personName)) && (
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        color: overdue ? "var(--danger-fg)" : "var(--text-3)",
                        marginTop: 2,
                      }}
                    >
                      {showPerson && t.personName ? `${t.personName} · ` : ""}
                      {t.clientName && showClientLink && t.client_id ? (
                        <Link href={`/app/clients/${t.client_id}`} style={{ color: "inherit" }}>
                          {t.clientName}
                        </Link>
                      ) : (
                        t.clientName ?? ""
                      )}
                      {t.clientName && t.due_date ? " · " : ""}
                      {t.due_date
                        ? `${overdue ? "overdue — " : "due "}${new Date(t.due_date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}`
                        : ""}
                    </span>
                  )}
                </span>

                {editable && (
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    aria-label={`Delete ${t.text}`}
                    title="Delete"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-3)",
                      cursor: "pointer",
                      padding: 4,
                      lineHeight: 0,
                      flexShrink: 0,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add a to-do…"
            style={{ ...field, flex: "2 1 200px" }}
          />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            title="Due date (optional)"
            style={{ ...field, flex: "1 1 140px" }}
          />
          {clients.length > 0 && (
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...field, flex: "1 1 150px" }}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={add} disabled={busy || !text.trim()} className="btn" style={{ flexShrink: 0 }}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      {done.length > 0 && (
        <button
          type="button"
          onClick={() => setShowDone((s) => !s)}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {showDone ? "Hide" : "Show"} {done.length} done
        </button>
      )}
    </div>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const field = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  minWidth: 0,
};
