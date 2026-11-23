"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { linesToSteps, type GuideTemplate } from "@/lib/guides";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t${Date.now()}`);

/** What every new Filming or Editing guide starts from. CEO and operations managers (0054). */
export function TemplateEditor({ template, label }: { template: GuideTemplate; label: string }) {
  const [elements, setElements] = useState(template.elements.join("\n"));
  const [steps, setSteps] = useState(template.steps.map((s) => s.text).join("\n"));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function save() {
    setBusy(true);
    setNote(null);
    const row = {
      stage: template.stage,
      elements: elements.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 40),
      steps: linesToSteps(steps, template.steps, newId),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("guide_templates").upsert(row, { onConflict: "stage" });
    setBusy(false);
    setNote(error ? { ok: false, text: error.message } : { ok: true, text: "Saved. New guides start from this." });
    if (!error) router.refresh();
  }

  return (
    <details className="card card-pad-sm pg-template">
      <summary>{label} template: what a new guide starts from</summary>
      <div className="pg-edit">
        <label>
          <span>Elements needed: one per line</span>
          <textarea rows={5} value={elements} onChange={(e) => setElements(e.target.value)} />
        </label>
        <label>
          <span>Steps: one per line, in order</span>
          <textarea rows={8} value={steps} onChange={(e) => setSteps(e.target.value)} />
        </label>
        <div className="script-actions">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </button>
          {note && (
            <span role="status" style={{ fontSize: 13, color: note.ok ? "var(--ok-fg)" : "var(--danger-fg)" }}>
              {note.text}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
