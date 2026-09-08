"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ResourceChecklistEditor, type EditableStep } from "./ResourceChecklistEditor";
import type { ResourceKind } from "@/lib/supabase/types";

export interface ResourceEntry {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  body: string | null;
  audience_role: string;
  assigned_to: string | null;
  /** Phase 22: the checklist steps people tick through. */
  steps?: EditableStep[];
}

const KINDS: ResourceKind[] = ["sop", "tutorial", "template", "other"];

const KIND_LABEL: Record<string, string> = {
  sop: "SOP",
  tutorial: "Tutorial",
  template: "Template",
  other: "Other",
};

/**
 * SOPs and tutorials, as either a link out (a Google Doc, a Loom) or
 * a short note written inline.
 *
 * Files are deliberately not uploaded here: Supabase storage isn't a
 * good fit for video, and everything of this kind the agency already
 * has lives in Drive or Loom. A link is what people actually have.
 *
 * `assignedTo` set means "only this person sees it"; left null it
 * applies to everyone in `audienceRole`. Which of the two a new entry
 * gets is chosen in the form.
 */
export function ResourcesPanel({
  initialResources,
  editable = false,
  audienceRole = "videographer",
  personId = null,
  personName = null,
  emptyMessage = "Nothing here yet.",
}: {
  initialResources: ResourceEntry[];
  editable?: boolean;
  audienceRole?: string;
  /** When set, the form can scope a new entry to this person alone. */
  personId?: string | null;
  personName?: string | null;
  emptyMessage?: string;
}) {
  const [resources, setResources] = useState(initialResources);
  const [adding, setAdding] = useState(false);
  // Set to the id of an SOP just created, so its checklist editor is
  // the obvious next thing to fill in — an SOP without steps isn't
  // usable as a checklist, and adding it later is easy to forget.
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ResourceKind>("sop");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [justThisPerson, setJustThisPerson] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  function reset() {
    setTitle("");
    setKind("sop");
    setUrl("");
    setBody("");
    setJustThisPerson(false);
  }

  async function add() {
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    if (!url.trim() && !body.trim()) {
      setError("Add a link or write some notes — otherwise there's nothing to show.");
      return;
    }
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
      setError("The link should start with http:// or https://");
      return;
    }

    setBusy(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("resources")
      .insert({
        title: title.trim(),
        kind,
        url: url.trim() || null,
        body: body.trim() || null,
        audience_role: audienceRole,
        assigned_to: justThisPerson ? personId : null,
        position: resources.length,
      })
      .select("id, title, kind, url, body, audience_role, assigned_to")
      .single();

    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not save that.");
      return;
    }

    setResources((prev) => [...prev, { ...(data as ResourceEntry), steps: [] }]);
    setJustCreatedId((data as { id: string }).id);
    reset();
    setAdding(false);
    router.refresh();
  }

  async function remove(id: string) {
    const prev = resources;
    setResources((rs) => rs.filter((r) => r.id !== id)); // optimistic
    const { error: deleteError } = await supabase.from("resources").delete().eq("id", id);
    if (deleteError) {
      setResources(prev);
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {resources.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          {emptyMessage}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {resources.map((r) => (
            <li
              key={r.id}
              style={{
                padding: "11px 13px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--text-1)",
                        }}
                      >
                        {r.title} ↗
                      </a>
                    ) : (
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
                        {r.title}
                      </span>
                    )}

                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-3)",
                        border: "1px solid var(--border)",
                        borderRadius: 20,
                        padding: "2px 8px",
                      }}
                    >
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </span>

                    {r.assigned_to && personName && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                        {personName} only
                      </span>
                    )}
                  </span>

                  {r.body && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        color: "var(--text-2)",
                        lineHeight: 1.55,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {r.body}
                    </p>
                  )}
                </span>

                {editable && (
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    aria-label={`Delete ${r.title}`}
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

              {/* Phase 22: the checklist attached to this SOP.
                  Management writes the steps here; videographers tick
                  their own copy on the Guidelines page. */}
              {editable && (
                <ResourceChecklistEditor
                  resourceId={r.id}
                  initialSteps={r.steps ?? []}
                  autoFocus={justCreatedId === r.id}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {editable &&
        (adding ? (
          <div
            style={{
              padding: "14px 16px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
            }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title, e.g. How we edit a Reel"
                style={{ ...field, flex: "2 1 200px" }}
              />
              <select value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)} style={{ ...field, flex: "1 1 120px" }}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>

            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Link to a doc or video (optional)"
              style={{ ...field, width: "100%", marginBottom: 10 }}
            />

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Or write the steps here (optional)"
              style={{ ...field, width: "100%", resize: "vertical", marginBottom: 10 }}
            />

            {personId && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  color: "var(--text-2)",
                }}
              >
                <input
                  type="checkbox"
                  checked={justThisPerson}
                  onChange={(e) => setJustThisPerson(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "var(--text-1)", cursor: "pointer" }}
                />
                Only for {personName ?? "this person"} — otherwise every videographer sees it
              </label>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={add} disabled={busy} className="btn btn-primary">
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                  reset();
                }}
                className="btn"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="btn">
            + Add SOP or tutorial
          </button>
        ))}
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
