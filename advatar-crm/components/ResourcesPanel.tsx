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
  position?: number;
}

export interface AudienceChoice {
  value: string;
  label: string;
}

const KINDS: ResourceKind[] = ["sop", "tutorial", "template", "other"];

const KIND_LABEL: Record<string, string> = {
  sop: "SOP",
  tutorial: "Tutorial",
  template: "Template",
  other: "Other",
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  staff: "Staff",
  videographer: "Videographers",
  operations_manager: "Ops managers",
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
  audienceChoices,
  defaultKind = "sop",
  withChecklists = true,
  addLabel = "+ Add SOP or tutorial",
}: {
  initialResources: ResourceEntry[];
  editable?: boolean;
  audienceRole?: string;
  /** When set, the form can scope a new entry to this person alone. */
  personId?: string | null;
  personName?: string | null;
  emptyMessage?: string;
  /**
   * Offered on the Tools page, where management is writing for the
   * whole team and has to say who each item is for. Left out on a
   * single videographer's page, where `audienceRole` already answers
   * that.
   */
  audienceChoices?: AudienceChoice[];
  defaultKind?: ResourceKind;
  /** The Resources half is reference material, so it has no steps. */
  withChecklists?: boolean;
  addLabel?: string;
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
  const [kind, setKind] = useState<ResourceKind>(defaultKind);
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState(audienceChoices?.[0]?.value ?? audienceRole);
  const [justThisPerson, setJustThisPerson] = useState(false);

  // The row currently open for editing, if any.
  const [editingId, setEditingId] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  function reset() {
    setTitle("");
    setKind(defaultKind);
    setUrl("");
    setBody("");
    setAudience(audienceChoices?.[0]?.value ?? audienceRole);
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
        audience_role: audienceChoices ? audience : audienceRole,
        assigned_to: justThisPerson ? personId : null,
        position: resources.length,
      })
      .select("id, title, kind, url, body, audience_role, assigned_to, position")
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

  /**
   * Moves an entry one place up or down.
   *
   * Two rows swap `position`, which is what the lists are ordered by.
   * Buttons rather than drag-and-drop: this is edited from a phone as
   * often as a laptop, and dragging a list item on touch fights the
   * page's own scrolling.
   */
  async function move(id: string, direction: -1 | 1) {
    const index = resources.findIndex((r) => r.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= resources.length) return;

    const reordered = [...resources];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setResources(reordered); // optimistic

    const writes = reordered.map((r, i) =>
      supabase.from("resources").update({ position: i }).eq("id", r.id)
    );
    const results = await Promise.all(writes);
    const failed = results.find((r) => r.error);

    if (failed?.error) {
      setResources(resources);
      setError(failed.error.message);
      return;
    }
    router.refresh();
  }

  async function saveEdit(id: string, patch: Partial<ResourceEntry>) {
    const prev = resources;
    setResources((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); // optimistic

    const { error: updateError } = await supabase
      .from("resources")
      .update({
        title: patch.title,
        kind: patch.kind,
        url: patch.url,
        body: patch.body,
        audience_role: patch.audience_role,
      })
      .eq("id", id);

    if (updateError) {
      setResources(prev);
      setError(updateError.message);
      return;
    }
    setEditingId(null);
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
          {resources.map((r, index) => (
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

                    {audienceChoices && (
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--text-2)",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: 20,
                          padding: "2px 8px",
                        }}
                      >
                        {AUDIENCE_LABEL[r.audience_role] ?? r.audience_role}
                      </span>
                    )}

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
                  <span style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => move(r.id, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${r.title} up`}
                      title="Move up"
                      style={{ ...iconButton, opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => move(r.id, 1)}
                      disabled={index === resources.length - 1}
                      aria-label={`Move ${r.title} down`}
                      title="Move down"
                      style={{ ...iconButton, opacity: index === resources.length - 1 ? 0.3 : 1 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 5v14M19 12l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                      aria-label={`Edit ${r.title}`}
                      title="Edit"
                      style={iconButton}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      aria-label={`Delete ${r.title}`}
                      title="Delete"
                      style={iconButton}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                )}
              </div>

              {editable && editingId === r.id && (
                <EditForm
                  resource={r}
                  audienceChoices={audienceChoices}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => saveEdit(r.id, patch)}
                />
              )}

              {/* Phase 22: the checklist attached to this SOP.
                  Management writes the steps here; videographers tick
                  their own copy on the Guidelines page. */}
              {editable && withChecklists && editingId !== r.id && (
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

            {audienceChoices && (
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                aria-label="Who is this for?"
                style={{ ...field, width: "100%", marginBottom: 10 }}
              >
                {audienceChoices.map((a) => (
                  <option key={a.value} value={a.value}>
                    For: {a.label}
                  </option>
                ))}
              </select>
            )}

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
            {addLabel}
          </button>
        ))}
    </div>
  );
}

/** Editing one entry in place, rather than delete-and-retype. */
function EditForm({
  resource,
  audienceChoices,
  onCancel,
  onSave,
}: {
  resource: ResourceEntry;
  audienceChoices?: AudienceChoice[];
  onCancel: () => void;
  onSave: (patch: Partial<ResourceEntry>) => void;
}) {
  const [title, setTitle] = useState(resource.title);
  const [kind, setKind] = useState(resource.kind as ResourceKind);
  const [url, setUrl] = useState(resource.url ?? "");
  const [body, setBody] = useState(resource.body ?? "");
  const [audience, setAudience] = useState(resource.audience_role);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!title.trim()) return setError("Give it a title.");
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
      return setError("The link should start with http:// or https://");
    }
    onSave({
      title: title.trim(),
      kind,
      url: url.trim() || null,
      body: body.trim() || null,
      audience_role: audience,
    });
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...field, flex: "2 1 200px" }} />
        <select value={kind} onChange={(e) => setKind(e.target.value as ResourceKind)} style={{ ...field, flex: "1 1 120px" }}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {audienceChoices && (
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          aria-label="Who is this for?"
          style={{ ...field, width: "100%", marginBottom: 10 }}
        >
          {audienceChoices.map((a) => (
            <option key={a.value} value={a.value}>
              For: {a.label}
            </option>
          ))}
        </select>
      )}

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
        placeholder="Or write it out here (optional)"
        style={{ ...field, width: "100%", resize: "vertical", marginBottom: 10 }}
      />

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={submit} className="btn btn-primary">
          Save changes
        </button>
        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
      </div>
    </div>
  );
}

const iconButton = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  cursor: "pointer",
  padding: 4,
  lineHeight: 0,
  flexShrink: 0,
} as const;

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
