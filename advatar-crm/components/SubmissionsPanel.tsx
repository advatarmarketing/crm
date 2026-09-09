"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SubmissionStatus, SubmissionVisibility } from "@/lib/supabase/types";
import type { ClientChoice } from "./SchedulePanel";
import { submitWorkAction, shareWithClientAction } from "@/app/app/my-work/actions";

export interface SubmissionVersion {
  id: string;
  version: number;
  url: string | null;
  notes: string | null;
  created_at: string;
}

export interface SubmissionFeedback {
  id: string;
  version: number | null;
  body: string;
  created_at: string;
  authorName?: string | null;
}

export interface SubmissionEntry {
  id: string;
  title: string;
  brief: string | null;
  status: SubmissionStatus;
  visibility: SubmissionVisibility;
  current_version: number;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
  clientName?: string | null;
  personName?: string | null;
  versions: SubmissionVersion[];
  feedback: SubmissionFeedback[];
}

/** In workflow order. */
const STATUS_LABEL: Record<SubmissionStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/**
 * Each status maps to a semantic tone rather than a fixed hex, so the
 * workflow reads the same in dark mode and the two states that need
 * action ("changes requested", "in review") are the two that carry
 * warm colour.
 */
const STATUS_COLOUR: Record<SubmissionStatus, string> = {
  submitted: "var(--info-fg)",
  in_review: "var(--warn-fg)",
  changes_requested: "var(--danger-fg)",
  approved: "var(--ok-fg)",
};

const STATUS_BG: Record<SubmissionStatus, string> = {
  submitted: "var(--info-bg)",
  in_review: "var(--warn-bg)",
  changes_requested: "var(--danger-bg)",
  approved: "var(--ok-bg)",
};

const STATUS_BORDER: Record<SubmissionStatus, string> = {
  submitted: "var(--info-border)",
  in_review: "var(--warn-border)",
  changes_requested: "var(--danger-border)",
  approved: "var(--ok-border)",
};

/**
 * Work handed in for review, with a version per revision round.
 *
 * Two audiences, one component:
 *   `canReview`  — CEO/admin: move the status on, leave feedback.
 *   `canSubmit`  — the videographer: raise work, add a new version.
 *
 * Neither flag is a permission boundary. A videographer has no update
 * policy on `submissions` at all (0020), so they cannot set a status
 * even by calling the API directly — approving your own work is the
 * exact thing this workflow exists to prevent. Adding a version moves
 * the row back to "submitted" through a database trigger instead.
 */
export function SubmissionsPanel({
  initialSubmissions,
  canReview = false,
  canSubmit = false,
  currentUserId = null,
  clients = [],
  emptyMessage = "Nothing submitted yet.",
  showPerson = false,
}: {
  initialSubmissions: SubmissionEntry[];
  canReview?: boolean;
  canSubmit?: boolean;
  currentUserId?: string | null;
  clients?: ClientChoice[];
  emptyMessage?: string;
  showPerson?: boolean;
}) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(clients.length === 1 ? clients[0].id : "");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<SubmissionVisibility>("team_only");
  const [note, setNote] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  /**
   * Submitting runs through a server action rather than an insert from
   * here, because sharing a video with a client also fills in their
   * content plan and notifies them — neither of which a videographer's
   * own session is allowed to do. See app/app/my-work/actions.ts.
   */
  async function createSubmission() {
    setBusy(true);
    setError(null);
    setNote(null);

    const result = await submitWorkAction({
      title,
      clientId,
      url,
      notes,
      visibility,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTitle("");
    setClientId(clients.length === 1 ? clients[0].id : "");
    setUrl("");
    setNotes("");
    setVisibility("team_only");
    setCreating(false);
    setNote(result.note);
    router.refresh();
  }

  async function setStatus(id: string, status: SubmissionStatus) {
    const prev = submissions;
    setSubmissions((ss) => ss.map((s) => (s.id === id ? { ...s, status } : s))); // optimistic

    const { error: updateError } = await supabase.from("submissions").update({ status }).eq("id", id);
    if (updateError) {
      setSubmissions(prev);
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {submissions.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          {emptyMessage}
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {submissions.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              canReview={canReview}
              canSubmit={canSubmit && s.created_by === currentUserId}
              currentUserId={currentUserId}
              showPerson={showPerson}
              onSetStatus={setStatus}
            />
          ))}
        </ul>
      )}

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {/* What happened to the content plan. Worth saying out loud: the
          videographer can't see the plan from here, so otherwise this
          is an invisible side effect. */}
      {note && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--ok-fg)",
            background: "var(--ok-bg)",
            border: "1px solid var(--ok-border)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 12px",
            margin: "0 0 12px",
          }}
        >
          {note}
        </p>
      )}

      {canSubmit &&
        (creating ? (
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
                placeholder="What is it? e.g. Bright Co — March Reel"
                style={{ ...field, flex: "2 1 220px" }}
              />
              {/* Required, as of prompt 11: every piece of work belongs
                  to exactly one client. Without it there is nothing to
                  match against a content plan and nobody to show it to. */}
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                aria-label="Which client is this for?"
                style={{ ...field, flex: "1 1 160px" }}
              >
                <option value="">Which client?</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Link to the video (Drive, Frame.io, Dropbox…)"
              style={{ ...field, width: "100%", marginBottom: 10 }}
            />

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything the reviewer should know (optional)"
              style={{ ...field, width: "100%", resize: "vertical", marginBottom: 12 }}
            />

            {/* Who sees it. Two radio cards rather than a dropdown,
                because this is the one choice on the form with a
                consequence the client will notice — sharing puts the
                video on their content plan and tells them about it. */}
            <fieldset style={{ border: "none", margin: "0 0 14px", padding: 0 }}>
              <legend style={{ ...subheading, padding: 0 }}>Who can see it</legend>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(
                  [
                    {
                      value: "team_only" as const,
                      label: "Team only",
                      hint: "For review. The client sees nothing.",
                    },
                    {
                      value: "team_and_client" as const,
                      label: "Team and client",
                      hint: "Goes on their content plan and they're told.",
                    },
                  ]
                ).map((option) => {
                  const chosen = visibility === option.value;
                  return (
                    <label
                      key={option.value}
                      style={{
                        flex: "1 1 200px",
                        display: "block",
                        padding: "10px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: `1px solid ${chosen ? "var(--accent)" : "var(--border)"}`,
                        boxShadow: chosen ? "0 0 0 2px var(--accent-ring)" : "none",
                        background: "var(--surface)",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="radio"
                          name="visibility"
                          checked={chosen}
                          onChange={() => setVisibility(option.value)}
                          style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                        />
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>
                          {option.label}
                        </span>
                      </span>
                      <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-2)", marginTop: 4, marginLeft: 24 }}>
                        {option.hint}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={createSubmission} disabled={busy} className="btn btn-primary">
                {busy ? "Submitting…" : "Submit for review"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
                className="btn"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCreating(true)} className="btn">
            + Submit work for review
          </button>
        ))}
    </div>
  );
}

function SubmissionCard({
  submission,
  canReview,
  canSubmit,
  currentUserId,
  showPerson,
  onSetStatus,
}: {
  submission: SubmissionEntry;
  canReview: boolean;
  canSubmit: boolean;
  currentUserId: string | null;
  showPerson: boolean;
  onSetStatus: (id: string, status: SubmissionStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [addingVersion, setAddingVersion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const latest = submission.versions[0];

  async function share() {
    setBusy(true);
    setError(null);
    setShareNote(null);

    const result = await shareWithClientAction(submission.id);

    setBusy(false);

    if (!result.ok) return setError(result.error);

    setShareNote(result.note ?? "Shared. The client has been told.");
    router.refresh();
  }

  async function leaveFeedback() {
    if (!feedbackText.trim()) return;
    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("submission_feedback").insert({
      submission_id: submission.id,
      version: submission.current_version,
      body: feedbackText.trim(),
      author_id: currentUserId,
    });

    setBusy(false);
    if (insertError) return setError(insertError.message);

    setFeedbackText("");
    router.refresh();
  }

  async function addVersion() {
    if (!newUrl.trim()) return setError("Paste the link to the new cut.");
    if (!/^https?:\/\//i.test(newUrl.trim())) {
      return setError("The link should start with http:// or https://");
    }

    setBusy(true);
    setError(null);

    // The trigger bumps current_version and puts the row back to
    // "submitted" — nothing here writes the status.
    const { error: insertError } = await supabase.from("submission_versions").insert({
      submission_id: submission.id,
      version: submission.current_version + 1,
      url: newUrl.trim(),
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
        borderLeft: `3px solid ${STATUS_COLOUR[submission.status]}`,
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 600, color: "var(--text-1)" }}>
              {submission.title}
            </span>
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--text-3)",
                marginTop: 3,
              }}
            >
              {[
                `v${submission.current_version}`,
                submission.visibility === "team_and_client" ? "shared with client" : "team only",
                showPerson ? submission.personName : null,
                submission.clientName,
                new Date(submission.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
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
              color: STATUS_COLOUR[submission.status],
              background: STATUS_BG[submission.status],
              border: `1px solid ${STATUS_BORDER[submission.status]}`,
              borderRadius: "var(--radius-pill)",
              padding: "4px 11px",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <span className="pill-dot" aria-hidden="true" />
            {STATUS_LABEL[submission.status]}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          {latest?.url && (
            <a
              href={latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ textDecoration: "none" }}
            >
              Watch v{latest.version} ↗
            </a>
          )}

          <button type="button" onClick={() => setOpen((o) => !o)} className="btn">
            {open ? "Hide" : "History & feedback"}
            {submission.feedback.length > 0 ? ` (${submission.feedback.length})` : ""}
          </button>

          {/* The usual path: handed in team-only, reviewed, then let
              the client see it. Sharing fills in their content plan
              and tells them, so it says so before you press it. */}
          {canReview && submission.visibility === "team_only" && (
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

        {/* Reviewer controls. A videographer never sees these, and
            couldn't use them if they did — no update policy. */}
        {canReview && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {(Object.keys(STATUS_LABEL) as SubmissionStatus[])
              .filter((s) => s !== submission.status)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSetStatus(submission.id, s)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    padding: "6px 10px",
                    borderRadius: 20,
                    border: `1px solid ${STATUS_COLOUR[s]}`,
                    background: "transparent",
                    color: STATUS_COLOUR[s],
                    cursor: "pointer",
                  }}
                >
                  → {STATUS_LABEL[s]}
                </button>
              ))}
          </div>
        )}

        {canSubmit && submission.status !== "approved" && (
          <div style={{ marginTop: 10 }}>
            {addingVersion ? (
              <div>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder={`Link to v${submission.current_version + 1}`}
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
                    {busy ? "Submitting…" : `Submit v${submission.current_version + 1}`}
                  </button>
                  <button type="button" onClick={() => setAddingVersion(false)} className="btn">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAddingVersion(true)} className="btn">
                + Submit a new version
              </button>
            )}
          </div>
        )}

        {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
      </div>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "12px 14px" }}>
          <span style={subheading}>Versions</span>
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {submission.versions.map((v) => (
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
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", flexShrink: 0 }}>
                  {new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>

          <span style={subheading}>Feedback</span>
          {submission.feedback.length === 0 ? (
            <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 10px" }}>
              No feedback yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {submission.feedback.map((f) => (
                <li
                  key={f.id}
                  style={{
                    padding: "9px 11px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-1)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {f.body}
                  </span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>
                    {[f.authorName, f.version ? `on v${f.version}` : null,
                      new Date(f.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {canReview && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={2}
                placeholder={`Feedback on v${submission.current_version}…`}
                style={{ ...field, flex: "1 1 240px", resize: "vertical" }}
              />
              <button
                type="button"
                onClick={leaveFeedback}
                disabled={busy || !feedbackText.trim()}
                className="btn"
                style={{ alignSelf: "flex-start" }}
              >
                {busy ? "Saving…" : "Add feedback"}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const subheading = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--text-3)",
  marginBottom: 8,
};

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
