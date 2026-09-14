"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SubmissionStatus } from "@/lib/supabase/types";
import type { UploadEntry } from "@/lib/uploads";
import { FeedbackThread } from "./FeedbackThread";
import { ChecklistPanel } from "./ChecklistPanel";
import { shareWithClientAction } from "@/app/app/uploads/actions";
import {
  field,
  subheading,
  meta,
  errorText,
  STATUS_LABEL,
  STATUS_FG,
  STATUS_BG,
  STATUS_BORDER,
} from "./styles";

export interface UploadAbilities {
  /** Move the status on, leave internal notes, share with the client. */
  canReview: boolean;
  /** Add a new cut and tick the checklist — the videographer who made it. */
  canSubmit: boolean;
  /** Read and write the client-facing thread. */
  canTalkToClient: boolean;
  /** A client login: one thread, no internal anything. */
  isClient: boolean;
}

/**
 * One video, and everything attached to it.
 *
 * This is the piece the whole Uploads tab exists for. Before it, a
 * submission was a row with a link and a status, and the conversation
 * about it happened in four other places — a message thread, a team
 * thread, a comment on the plan, and WhatsApp. Everything about one
 * cut now sits under that cut: the versions, the internal review, the
 * client's comments, and the list of fixes those produced.
 *
 * What each role gets is decided by `abilities`, which the page works
 * out from the signed-in role. None of it is a permission boundary —
 * RLS (0020 and 0028) is. A videographer with `canReview` forced on
 * would see the status buttons and every one of them would fail,
 * because they have no update policy on `submissions` at all.
 */
export function UploadCard({
  upload,
  abilities,
  currentUserId,
  showPerson,
  defaultOpen = false,
}: {
  upload: UploadEntry;
  abilities: UploadAbilities;
  currentUserId: string;
  showPerson: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [addingVersion, setAddingVersion] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>(upload.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const latest = upload.versions[0];
  const teamNotes = upload.notes.filter((n) => n.audience === "team");
  const clientNotes = upload.notes.filter((n) => n.audience === "client");
  const openItems = upload.checklist.filter((c) => !c.done).length;

  // What is worth a glance without opening the card. The client's
  // count is listed separately from the team's because a client
  // comment usually needs a decision, not just a re-edit.
  const summary = [
    `v${upload.current_version}`,
    showPerson ? upload.personName : null,
    upload.clientName,
    abilities.isClient ? null : upload.visibility === "team_and_client" ? "shared with client" : "team only",
    clientNotes.length > 0 && !abilities.isClient ? `${clientNotes.length} from the client` : null,
    openItems > 0 && !abilities.isClient ? `${openItems} to fix` : null,
    new Date(upload.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  ].filter(Boolean);

  async function moveStatus(next: SubmissionStatus) {
    const before = status;
    setStatus(next);
    setError(null);

    const { error: updateError } = await supabase.from("submissions").update({ status: next }).eq("id", upload.id);

    if (updateError) {
      setStatus(before);
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function share() {
    setBusy(true);
    setError(null);
    setShareNote(null);

    const result = await shareWithClientAction(upload.id);

    setBusy(false);
    if (!result.ok) return setError(result.error);

    setShareNote(result.note ?? "Shared. The client has been told.");
    router.refresh();
  }

  async function addVersion() {
    const url = newUrl.trim();
    if (!url) return setError("Paste the link to the new cut.");
    if (!/^https?:\/\//i.test(url)) return setError("The link should start with http:// or https://");

    setBusy(true);
    setError(null);

    // Nothing here writes the status: a trigger (0020) bumps
    // current_version and puts the row back to "submitted", which is
    // why a videographer needs no update policy on `submissions`.
    const { error: insertError } = await supabase.from("submission_versions").insert({
      submission_id: upload.id,
      version: upload.current_version + 1,
      url,
      notes: newNotes.trim() || null,
      submitted_by: currentUserId,
    });

    setBusy(false);
    if (insertError) return setError(insertError.message);

    setNewUrl("");
    setNewNotes("");
    setAddingVersion(false);
    router.refresh();
  }

  return (
    <li
      style={{
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${STATUS_FG[status]}`,
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "13px 15px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
              {upload.title}
            </span>
            <span style={{ ...meta, display: "block", marginTop: 3 }}>{summary.join(" · ")}</span>
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: STATUS_FG[status],
              background: STATUS_BG[status],
              border: `1px solid ${STATUS_BORDER[status]}`,
              borderRadius: "var(--radius-pill)",
              padding: "4px 11px",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <span className="pill-dot" aria-hidden="true" />
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 11 }}>
          {latest?.url && (
            <a href={latest.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none" }}>
              Watch v{latest.version} ↗
            </a>
          )}

          <button type="button" onClick={() => setOpen((o) => !o)} className="btn">
            {open ? "Hide details" : abilities.isClient ? "Comment & history" : "Review, comments & checklist"}
          </button>

          {abilities.canReview && upload.visibility === "team_only" && (
            <button type="button" onClick={share} disabled={busy} className="btn">
              {busy ? "Sharing…" : "Share with the client"}
            </button>
          )}
        </div>

        {shareNote && (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              color: "var(--ok-fg)",
              background: "var(--ok-bg)",
              border: "1px solid var(--ok-border)",
              borderRadius: "var(--radius-sm)",
              padding: "9px 12px",
              margin: "10px 0 0",
            }}
          >
            {shareNote}
          </p>
        )}

        {abilities.canReview && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {(Object.keys(STATUS_LABEL) as SubmissionStatus[])
              .filter((s) => s !== status)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => moveStatus(s)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    padding: "6px 10px",
                    borderRadius: 20,
                    border: `1px solid ${STATUS_FG[s]}`,
                    background: "transparent",
                    color: STATUS_FG[s],
                    cursor: "pointer",
                  }}
                >
                  → {STATUS_LABEL[s]}
                </button>
              ))}
          </div>
        )}

        {abilities.canSubmit && status !== "approved" && (
          <div style={{ marginTop: 11 }}>
            {addingVersion ? (
              <div>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder={`Link to v${upload.current_version + 1}`}
                  style={{ ...field, width: "100%", marginBottom: 8 }}
                />
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  placeholder="What changed in this version? (optional)"
                  style={{ ...field, width: "100%", resize: "vertical", marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={addVersion} disabled={busy} className="btn btn-primary">
                    {busy ? "Uploading…" : `Upload v${upload.current_version + 1}`}
                  </button>
                  <button type="button" onClick={() => setAddingVersion(false)} className="btn">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingVersion(true)} className="btn">
                + Upload a new version
              </button>
            )}
          </div>
        )}

        {error && <p style={errorText}>{error}</p>}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "14px 15px" }}>
          {/* The checklist sits first for the person who has to act on
              it, and is hidden entirely from the client — it carries
              items made from the team's internal notes. */}
          {!abilities.isClient && (
            <ChecklistPanel submissionId={upload.id} items={upload.checklist} editable={abilities.canSubmit} />
          )}

          {/* The client-facing thread. The videographer is in it too:
              a question about a client's note is best answered by the
              person who shot it. */}
          {(abilities.canTalkToClient || clientNotes.length > 0) && (
            <FeedbackThread
              submissionId={upload.id}
              clientId={upload.client_id}
              version={upload.current_version}
              audience="client"
              notes={clientNotes}
              currentUserId={currentUserId}
              canPost={abilities.canTalkToClient}
              title={abilities.isClient ? "Your comments" : "With the client"}
              hint={
                abilities.isClient
                  ? "Your team sees these. Add a time or a screenshot if it's about one moment."
                  : "The client can read this thread."
              }
              placeholder={
                abilities.isClient
                  ? "What would you like changed?"
                  : "Reply to the client…"
              }
            />
          )}

          {/* The internal review. No client policy exists on these rows
              at all (0028), so this section simply has nothing to show
              a client even if it rendered. */}
          {!abilities.isClient && (
            <FeedbackThread
              submissionId={upload.id}
              clientId={upload.client_id}
              version={upload.current_version}
              audience="team"
              notes={teamNotes}
              currentUserId={currentUserId}
              canPost={abilities.canReview || abilities.canSubmit}
              title="Internal review"
              hint="The client cannot see this."
              placeholder={`Note on v${upload.current_version}…`}
            />
          )}

          <span style={subheading}>Versions</span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {upload.versions.map((v) => (
              <li key={v.id} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", minWidth: 26 }}>
                  v{v.version}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  {v.url ? (
                    <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--text-1)" }}>
                      {v.url.length > 60 ? `${v.url.slice(0, 60)}…` : v.url} ↗
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--text-3)" }}>no link</span>
                  )}
                  {v.notes && (
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.5 }}>
                      {v.notes}
                    </span>
                  )}
                </span>
                <span style={{ ...meta, flexShrink: 0 }}>
                  {new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
