"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TASK_PRIORITIES, priorityLabel, priorityRank, type TaskPriority } from "@/lib/tasks";
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
  /** 0037. Reads as "normal" everywhere until that migration is run. */
  priority?: TaskPriority | null;
}

/**
 * Ticking, adding, editing and removing to-dos. Same pattern as
 * SchedulePanel: writes go through the browser client so `tasks` RLS
 * (0002/0010/0019) decides what is allowed, and the props below only
 * govern which controls are offered.
 *
 * A to-do is a `tasks` row — the same table the client detail page
 * and dashboard already use — so anything added here shows up
 * wherever that client's tasks are listed, rather than living in a
 * parallel list of its own. Editing one here changes it everywhere,
 * for the same reason.
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
  canEdit,
  priorityAvailable = false,
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
  /**
   * Whether tapping a to-do opens it for editing. Defaults to whatever
   * `canTick` is, because they are the same permission underneath —
   * both are an UPDATE on the row, and every policy that grants one
   * grants the other. A caller that wants a list ticked but not
   * reworded (the dashboard's fold of everyone else's work) says so
   * explicitly.
   */
  canEdit?: boolean;
  /**
   * Whether `tasks.priority` exists yet (0037). False hides the
   * priority control rather than offering a dropdown whose every save
   * would fail — see lib/tasks.ts for why the column cannot simply be
   * assumed to be there.
   */
  priorityAvailable?: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  /** The to-do currently open for editing, if any. */
  const [editing, setEditing] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const mayEdit = canEdit ?? canTick;

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  // Sorted by priority ALONE. Array.prototype.sort is stable, so
  // everything at the same level keeps the order the page sent it in —
  // which is already by due date. That matters on a database where
  // 0037 has not been run: every to-do reads as "normal", nothing
  // moves, and the list looks exactly as it did before.
  const visible = (showDone ? tasks : open)
    .slice()
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

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
    // `priority` is deliberately not read back: it is left out of the
    // select for the same reason it is left out of every page's, and a
    // new row always starts at the column's default anyway.
    setTasks((prev) => [...prev, { ...(data as TodoEntry), clientName, priority: "normal" }]);
    setText("");
    setDue("");
    setClientId("");
    router.refresh();
  }

  /**
   * Saves an edit. Returns whether it worked, so a failed save keeps
   * the editor open with what was typed still in it rather than
   * swallowing the change.
   */
  async function saveEdit(id: string, patch: EditPatch): Promise<boolean> {
    const prev = tasks;
    setError(null);

    const { clientName, ...columns } = patch;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...columns, clientName } : t))); // optimistic

    const { error: updateError } = await supabase.from("tasks").update(columns).eq("id", id);

    if (updateError) {
      setTasks(prev);
      setError(updateError.message);
      return false;
    }

    router.refresh();
    return true;
  }

  async function remove(id: string) {
    const prev = tasks;
    setEditing((e) => (e === id ? null : e));
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
            const isOpen = editing === t.id;
            const pill = TASK_PRIORITIES.find((p) => p.id === (t.priority ?? "normal"))?.pill ?? null;

            return (
              <li
                key={t.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  // Overdue is the only state that tints. A to-do list
                  // where every row is coloured tells you nothing — the
                  // priority pill does that job without repainting the
                  // whole row.
                  background: overdue ? "var(--danger-bg)" : "var(--surface)",
                  border: `1px solid ${overdue ? "var(--danger-border)" : isOpen ? "var(--border-2)" : "var(--border)"}`,
                  opacity: t.done ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
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

                  {/* A button where the row can be edited, plain text
                      where it cannot — rather than a control that looks
                      live and does nothing. */}
                  {mayEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditing(isOpen ? null : t.id)}
                      aria-expanded={isOpen}
                      title="Edit this to-do"
                      style={{ ...bareButton, minWidth: 0, flex: 1, textAlign: "left", cursor: "pointer" }}
                    >
                      <TaskLine t={t} overdue={Boolean(overdue)} pill={pill} showPerson={showPerson} showClientLink={false} />
                    </button>
                  ) : (
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <TaskLine
                        t={t}
                        overdue={Boolean(overdue)}
                        pill={pill}
                        showPerson={showPerson}
                        showClientLink={showClientLink}
                      />
                    </span>
                  )}

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
                </div>

                {isOpen && (
                  <TaskEditor
                    task={t}
                    clients={clients}
                    priorityAvailable={priorityAvailable}
                    onCancel={() => setEditing(null)}
                    onSave={async (patch) => {
                      const ok = await saveEdit(t.id, patch);
                      if (ok) setEditing(null);
                      return ok;
                    }}
                  />
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

      {mayEdit && visible.length > 0 && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-3)", margin: "10px 0 0" }}>
          Tap a to-do to change its wording, its date or how urgent it is.
        </p>
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

// =================================================================
// The row
// =================================================================

/**
 * The wording, the priority pill and the meta line.
 *
 * Pulled out because it renders inside a <button> when the row can be
 * edited and inside a <span> when it cannot, and a link to a client
 * page cannot sit inside a button — nesting them leaves a control that
 * swallows the link on some browsers and navigates instead of opening
 * the editor on others. So where the row opens, the client is plain
 * text; the client page is one tap away from the client list either
 * way.
 */
function TaskLine({
  t,
  overdue,
  pill,
  showPerson,
  showClientLink,
}: {
  t: TodoEntry;
  overdue: boolean;
  pill: string | null;
  showPerson: boolean;
  showClientLink: boolean;
}) {
  const hasMeta = Boolean(t.due_date || t.clientName || (showPerson && t.personName));

  return (
    <>
      <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
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
        {/* Not on a finished to-do: how urgent it was stopped
            mattering the moment it was ticked. */}
        {pill && !t.done && (
          <span className={pill} style={{ fontSize: 9, padding: "2px 7px", letterSpacing: "0.05em" }}>
            {priorityLabel(t.priority)}
          </span>
        )}
      </span>

      {hasMeta && (
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
    </>
  );
}

// =================================================================
// The editor
// =================================================================

type EditPatch = {
  text: string;
  due_date: string | null;
  client_id: string | null;
  priority?: TaskPriority;
  /** Carried alongside so the row can relabel itself without a reload. */
  clientName: string | null;
};

/**
 * Opens inside the row rather than over the page.
 *
 * A modal would cover the rest of the list, which is exactly the
 * context you are deciding against — "is this more urgent than the
 * other four things due Friday" is unanswerable with the other four
 * hidden.
 */
function TaskEditor({
  task,
  clients,
  priorityAvailable,
  onSave,
  onCancel,
}: {
  task: TodoEntry;
  clients: ClientChoice[];
  priorityAvailable: boolean;
  onSave: (patch: EditPatch) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(task.text);
  const [due, setDue] = useState(task.due_date ?? "");
  const [clientId, setClientId] = useState(task.client_id ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority ?? "normal");
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  // The wording is what people open this for most often, so the cursor
  // starts in it, selected and ready to be typed over.
  useEffect(() => {
    firstField.current?.focus();
    firstField.current?.select();
  }, []);

  const changed =
    text.trim() !== task.text ||
    (due || null) !== (task.due_date ?? null) ||
    (clientId || null) !== (task.client_id ?? null) ||
    priority !== (task.priority ?? "normal");

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    const ok = await onSave({
      text: text.trim(),
      due_date: due || null,
      client_id: clientId || null,
      // Left out entirely rather than sent when the column is not
      // there yet: PostgREST would reject the whole update, and the
      // wording and the date would fail to save along with it.
      ...(priorityAvailable ? { priority } : {}),
      clientName: clients.find((c) => c.id === clientId)?.name ?? (clientId ? task.clientName ?? null : null),
    });
    if (!ok) setSaving(false);
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <label style={{ display: "block" }}>
        <span style={editorLabel}>What needs doing</span>
        <input
          ref={firstField}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          style={{ ...field, width: "100%" }}
        />
      </label>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {priorityAvailable && (
          <label style={{ flex: "1 1 130px", minWidth: 0 }}>
            <span style={editorLabel}>How urgent</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              style={{ ...field, width: "100%" }}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ flex: "1 1 150px", minWidth: 0 }}>
          <span style={editorLabel}>Due</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ ...field, width: "100%" }} />
        </label>

        {clients.length > 0 && (
          <label style={{ flex: "1 1 150px", minWidth: 0 }}>
            <span style={editorLabel}>Client</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...field, width: "100%" }}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* A date field can be typed into but not emptied on every
          browser, and "this no longer has a deadline" is a real
          decision rather than a mistake. */}
      {due && (
        <button
          type="button"
          onClick={() => setDue("")}
          style={{ ...bareButton, ...editorLabel, alignSelf: "flex-start", marginBottom: 0, cursor: "pointer" }}
        >
          Clear the due date
        </button>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={save} disabled={saving || !text.trim() || !changed} className="btn">
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            ...bareButton,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-2)",
            padding: "4px 2px",
          }}
        >
          Cancel
        </button>
      </div>

      {!priorityAvailable && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-3)", margin: 0 }}>
          Priorities need one database update (migration 0037) before they can be
          set. Everything else here saves as normal.
        </p>
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

const bareButton = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  font: "inherit",
};

const editorLabel = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-3)",
  marginBottom: 5,
};
