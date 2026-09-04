"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addChecklistItem, applyTaskTemplate } from "@/app/app/clients/[id]/actions";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  position: number;
}

export interface TemplateOption {
  id: string;
  name: string;
}

/**
 * The onboarding checklist, plus the "apply a task template" control.
 *
 * Ticking writes straight from the browser (the same optimistic
 * pattern the tasks and documents lists already use) — the checklist
 * table's RLS decides whether it's allowed, and a rejected write
 * reverts.
 */
export function OnboardingChecklist({
  clientId,
  items,
  templates,
}: {
  clientId: string;
  items: ChecklistItem[];
  templates: TemplateOption[];
}) {
  const [checklist, setChecklist] = useState(items);
  const [newLabel, setNewLabel] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const done = checklist.filter((i) => i.done).length;
  const pct = checklist.length > 0 ? Math.round((done / checklist.length) * 100) : 0;

  async function toggle(id: string, next: boolean) {
    const prev = checklist;
    setChecklist((list) => list.map((i) => (i.id === id ? { ...i, done: next } : i)));

    const supabase = createClient();
    const { error } = await supabase
      .from("client_checklist_items")
      .update({ done: next, done_at: next ? new Date().toISOString() : null })
      .eq("id", id);

    if (error) setChecklist(prev);
  }

  async function addStep() {
    const label = newLabel.trim();
    if (!label) return;
    setBusy(true);
    const result = await addChecklistItem(clientId, label);
    setBusy(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setNewLabel("");
    router.refresh();
  }

  async function applyTemplate() {
    if (!templateId) return;
    setBusy(true);
    setMessage(null);
    const result = await applyTaskTemplate(clientId, templateId);
    setBusy(false);
    setMessage(result.error ?? `Added ${result.created} task${result.created === 1 ? "" : "s"}.`);
    if (!result.error) {
      setTemplateId("");
      router.refresh();
    }
  }

  return (
    <div>
      {checklist.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--surface-3)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: pct === 100 ? "var(--status-active)" : "var(--text-1)",
                  borderRadius: 999,
                }}
              />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
              {done}/{checklist.length}
            </span>
          </div>

          <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {checklist.map((item) => (
              <li key={item.id}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 4px",
                    minHeight: 44,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                    style={{ width: 18, height: 18, flexShrink: 0, accentColor: "var(--status-active)" }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13.5,
                      color: item.done ? "var(--text-3)" : "var(--text-1)",
                      textDecoration: item.done ? "line-through" : "none",
                    }}
                  >
                    {item.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {checklist.length === 0 && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          No checklist yet — one is created automatically when this client becomes Active.
        </p>
      )}

      <div className="row-2" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStep();
              }
            }}
            placeholder="Add a step…"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 11px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-1)",
            }}
          />
          <button type="button" className="btn" onClick={addStep} disabled={busy || !newLabel.trim()}>
            Add
          </button>
        </div>

        {templates.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label="Task template"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "9px 11px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text-1)",
              }}
            >
              <option value="">Apply a task template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn" onClick={applyTemplate} disabled={busy || !templateId}>
              Apply
            </button>
          </div>
        )}
      </div>

      {message && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: 0 }}>{message}</p>
      )}
    </div>
  );
}
