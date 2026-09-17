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
  /** Move the status on, leave feedback, share with the client. */
  canReview: boolean;
  /** Add a new cut and work the checklist — the videographer who made it. */
  canSubmit: boolean;
  /**
   * Write in the client-facing thread: a reviewer, or the client.
   *
   * NOT the videographer. Feedback on a video comes from the people
   * reviewing it and from the client; the videographer reads it and
   * answers it by re-cutting, which is what the checklist is for.
   * The boundary is `submission_feedback`'s policies (0020, 0029),
   * not this flag — a videographer's session has no insert policy
   * there at all, so a composer shown to them by mistake would fail
   * rather than post.
   */
  canCommentToClient: boolean;
  /** Write in the internal review thread: reviewers only. */
  canCommentInternal: boolean;
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
 * ---------------------------------------------------------------
 * Shut by default, and one row tall
 * ---------------------------------------------------------------
 * All of that is a lot of screen for one video, and this page is a
 * list: a busy month is dozens of cuts across every client. So the
 * card is a single row until somebody opens it, and the row carries
 * only what is needed to decide whether to open it — status, title,
 * whose it is, which client, and whether anything is waiting.
 *
 * The controls that used to sit in the header (watch, share, the
 * status chips) moved inside. Six buttons per row, forty rows deep,
 * is not a list anybody can scan, and every one of those actions is
 * something you do to a video you have already picked out.
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

  // The line under the title. Facts only — who, which client, when —
  // because anything that needs a decision belongs in a counter
  // chip, where it reads as something waiting rather than as more
  // description.
  const line = [
    `v${upload.current_version}`,
    showPerson ? upload.personName : null,
    upload.clientName,
    abilities.isClient ? null : upload.visibility === "team_and_client" ? "shared" : "team only",
    new Date(upload.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  ]
    .filter(Boolean)
    .join(" · ");

  // Counters, and only the ones that mean somebody is waiting. A
  // chip that is always there stops being read after the first
  // screenful, so each of these is absent at zero.
  const counters: { label: string; tone: "accent" | "warn" | "quiet" }[] = [];
  if (!abilities.isClient && clientNotes.length > 0) {
    counters.push({
      label: `${clientNotes.length} from client`,
      tone: "accent",
    });
  }
  if (!abilities.isClient && openItems > 0) {
    counters.push({ label: `${openItems} to fix`, tone: "warn" });
  }
  if (abilities.isClient && clientNotes.length > 0) {
    counters.push({ label: `${clientNotes.length} comments`, tone: "quiet" });
  }
  if (!abilities.isClient && teamNotes.length > 0 && clientNotes.length === 0 && openItems === 0) {
    counters.push({ label: `${teamNotes.length} notes`, tone: "quiet" });
  }

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
        // The status colour is the row's left edge rather than a
        // block of fill: at forty rows a coloured stripe scans, and
        // forty coloured panels do not.
        borderLeft: `3px solid ${STATUS_FG[status]}`,
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
        boxShadow: open ? "var(--shadow-sm)" : "none",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        className="upload-row"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg
          className="upload-chevron"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>

        <span className="upload-main">
          <span
            className="upload-title"
            style={{
              display: "block",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-1)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {upload.title}
          </span>
          <span style={{ ...meta, display: "block", marginTop: 2 }}>{line}</span>
        </span>

        <span className="upload-badges">
        {counters.map((c) => (
          <span
            key={c.label}
            style={{
              flexShrink: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              whiteSpace: "nowrap",
              padding: "3px 8px",
              borderRadius: "var(--radius-pill)",
              color: c.tone === "accent" ? "var(--accent-fg, var(--text-1))" : c.tone === "warn" ? "var(--warn-fg)" : "var(--text-3)",
              background: c.tone === "warn" ? "var(--warn-bg)" : "var(--surface-2)",
              border: `1px solid ${c.tone === "warn" ? "var(--warn-border)" : "var(--border)"}`,
            }}
          >
            {c.label}
          </span>
        ))}

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: STATUS_FG[status],
            background: STATUS_BG[status],
            border: `1px solid ${STATUS_BORDER[status]}`,
            borderRadius: "var(--radius-pill)",
            padding: "3px 9px",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <span className="pill-dot" aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
        </span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "14px 15px" }}>
          {/* The actions, now that a video has actually been picked
              out. Watch first: it is what you do before anything
              else here. */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            {latest?.url && (
              <a href={latest.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none" }}>
                Watch v{latest.version} ↗
              </a>
            )}

            {abilities.canReview && upload.visibility === "team_only" && (
              <button type="button" onClick={share} disabled={busy} className="btn">
                {busy ? "Sharing…" : "Share with the client"}
              </button>
            )}

            {abilities.canSubmit && status !== "approved" && !addingVersion && (
              <button type="button" onClick={() => setAddingVersion(true)} className="btn">
                + Upload a new version
              </button>
            )}
          </div>

          {abilities.canReview && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
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
                margin: "0 0 14px",
              }}
            >
              {shareNote}
            </p>
          )}

          {abilities.canSubmit && addingVersion && (
            <div style={{ marginBottom: 16 }}>
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
          )}

          {error && <p style={{ ...errorText, margin: "0 0 14px" }}>{error}</p>}

          {/* The checklist sits first for the person who has to act on
              it, and is hidden entirely from the client — it carries
              items made from the team's internal notes. */}
          {!abilities.isClient && (
            <ChecklistPanel submissionId={upload.id} items={upload.checklist} editable={abilities.canSubmit} />
          )}

          {/* The client-facing thread. The videographer is in it too:
              a question about a client's note is best answered by the
              person who shot it. */}
          {(abilities.canCommentToClient || clientNotes.length > 0) && (
            <FeedbackThread
              submissionId={upload.id}
              clientId={upload.client_id}
              version={upload.current_version}
              audience="client"
              notes={clientNotes}
              currentUserId={currentUserId}
              canPost={abilities.canCommentToClient}
              title={abilities.isClient ? "Your comments" : "With the client"}
              hint={
                abilities.isClient
                  ? "Your team sees these. Add a time or a screenshot if it's about one moment."
                  : abilities.canCommentToClient
                    ? "The client can read this thread."
                    : "What the client said about this cut."
              }
              placeholder={abilities.isClient ? "What would you like changed?" : "Reply to the client…"}
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
              canPost={abilities.canCommentInternal}
              title="Internal review"
              hint={
                abilities.canCommentInternal
                  ? "The client cannot see this."
                  : "What the team said about this cut. The client cannot see it."
              }
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
