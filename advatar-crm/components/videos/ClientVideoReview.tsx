"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { formatTimecode, parseTimecode } from "@/lib/uploads";
import { downloadHref, playerFor } from "@/lib/video-links";
import { clientDecideAction, clientNoteAction } from "@/app/app/portal/videos/actions";

/**
 * One delivered video (or thumbnail, or graphic) on the client's
 * Videos page: the player on one side, what they can do about it on
 * the other.
 *
 * What they can do comes from their package (0041), and the database
 * enforces the same thing (0042):
 *   none    — nothing to do. We say when it goes out.
 *   approve — one button: "Approved, no changes".
 *   full    — approve, or leave notes pinned to moments and ask for
 *             changes, up to their number of rounds.
 *   unset   — no package chosen yet: behaves like full, which is what
 *             a client could already do before packages existed.
 */

export type ReviewMode = "none" | "approve" | "full" | "unset";

export interface ReviewNote {
  id: string;
  body: string;
  timecode: number | null;
  authorName: string | null;
  mine: boolean;
  createdAt: string;
}

const mono: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

export function ClientVideoReview({
  anchorId,
  title,
  kind,
  meta,
  url,
  streamUrl,
  submissionId,
  version,
  decision,
  mode,
  roundsLeft,
  notes,
}: {
  anchorId: string;
  title: string;
  kind: "video" | "thumbnail" | "graphic";
  /** "Goes out Fri 20 Nov · Behind the scenes". */
  meta: string | null;
  url: string | null;
  streamUrl: string | null;
  submissionId: string;
  version: number;
  decision: "approved" | "changes_requested" | null;
  mode: ReviewMode;
  /** Null when there is no limit. */
  roundsLeft: number | null;
  notes: ReviewNote[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = playerFor(streamUrl, url);
  const download = downloadHref(url);
  const canApprove = mode !== "none";
  const canChange = (mode === "full" || mode === "unset") && (roundsLeft === null || roundsLeft > 0);
  const knowsTime = source?.kind === "native";

  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function noteHere() {
    const v = videoRef.current;
    if (v) {
      v.pause();
      setTime(formatTimecode(v.currentTime));
    }
    setWriting(true);
    setError(null);
  }

  function seek(seconds: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seconds;
    v.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function addNote() {
    const seconds = time.trim() ? parseTimecode(time) : null;
    if (time.trim() && seconds === null) return setError("Write the time like 0:42 or 1:05.");
    setBusy(true);
    setError(null);
    const res = await clientNoteAction(submissionId, version, body, seconds);
    setBusy(false);
    if (res.error) return setError(res.error);
    setBody("");
    setTime("");
    setDone("Note added. Add another, or press “Send changes to the team” when you’re done.");
    router.refresh();
  }

  async function decide(next: "approved" | "changes_requested") {
    setBusy(true);
    setError(null);
    const res = await clientDecideAction(submissionId, next, next === "changes_requested" ? body : "");
    setBusy(false);
    if (res.error) return setError(res.error);
    setBody("");
    setTime("");
    setWriting(false);
    setDone(next === "approved" ? "Thanks — marked as approved." : "Sent. Your team will make the changes and send a new cut.");
    router.refresh();
  }

  const isImage = kind !== "video";

  return (
    <article id={anchorId} className="card card-pad" style={{ scrollMarginTop: 90 }}>
      <div className="video-review">
        <div style={{ minWidth: 0 }}>
          {source?.kind === "native" && !isImage ? (
            <video
              ref={videoRef}
              src={source.src}
              controls
              playsInline
              preload="metadata"
              style={{ width: "100%", borderRadius: "var(--radius-sm)", background: "#000", aspectRatio: "9 / 16", maxHeight: 620 }}
            />
          ) : source?.kind === "frame" ? (
            <iframe
              src={source.src}
              title={title}
              loading="lazy"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{
                width: "100%",
                border: 0,
                borderRadius: "var(--radius-sm)",
                background: "#000",
                aspectRatio: isImage ? "1 / 1" : "9 / 16",
                maxHeight: 620,
              }}
            />
          ) : source?.kind === "link" ? (
            <a href={source.href} target="_blank" rel="noopener noreferrer" className="btn">
              Open {isImage ? "the image" : "the video"} ↗
            </a>
          ) : (
            <p style={{ color: "var(--text-3)", fontSize: 14 }}>The link to this one is missing — your team has been told.</p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {download && (
              <a href={download} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none" }}>
                Download
              </a>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 4px" }}>{title}</h3>
            {meta && <p style={{ ...mono, margin: 0 }}>{meta}</p>}
          </div>

          {decision === "approved" && <span className="pill pill-ok" style={{ alignSelf: "flex-start" }}>✓ Approved</span>}
          {decision === "changes_requested" && (
            <span className="pill pill-warn" style={{ alignSelf: "flex-start" }}>
              Changes asked for — your team is on it
            </span>
          )}

          {mode === "none" && (
            <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, margin: 0 }}>
              Ready to go. Nothing for you to do — we’ll post it for you.
            </p>
          )}

          {canApprove && decision !== "approved" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" className="btn btn-ok" onClick={() => decide("approved")} disabled={busy}>
                ✓ Approved — no changes needed
              </button>
              {canChange && !writing && (
                <button type="button" className="btn btn-warn" onClick={() => (knowsTime ? noteHere() : setWriting(true))} disabled={busy}>
                  {knowsTime ? "⏸ Leave a note at this point" : "Ask for a change"}
                </button>
              )}
              {(mode === "full" || mode === "unset") && roundsLeft !== null && (
                <p style={{ ...mono, margin: 0 }}>
                  {roundsLeft > 0
                    ? `${roundsLeft} round${roundsLeft === 1 ? "" : "s"} of changes left on this ${kind}`
                    : `All rounds of changes used on this ${kind}`}
                </p>
              )}
              {mode === "approve" && (
                <p style={{ fontSize: 12.5, color: "var(--text-3)", margin: 0 }}>
                  Your package includes approval. If something is wrong, message your team.
                </p>
              )}
            </div>
          )}

          {writing && canChange && (
            <div className="card card-pad-sm" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!isImage && (
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  At
                  <input
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    placeholder="0:42"
                    inputMode="numeric"
                    aria-label="Time in the video"
                    style={{ width: 80 }}
                  />
                  {knowsTime ? (
                    <button type="button" className="btn" onClick={noteHere}>
                      Use where it’s paused
                    </button>
                  ) : (
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                      Pause the video and type the time shown (optional)
                    </span>
                  )}
                </label>
              )}
              <textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={isImage ? "What would you like changed?" : "What would you like changed here?"}
                aria-label="Your note"
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn" onClick={addNote} disabled={busy || !body.trim()}>
                  Add note
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => decide("changes_requested")}
                  disabled={busy || (!body.trim() && notes.filter((n) => n.mine).length === 0)}
                >
                  Send changes to the team
                </button>
                <button type="button" className="btn" onClick={() => setWriting(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" style={{ color: "var(--danger-fg)", fontSize: 13.5, margin: 0 }}>
              {error}
            </p>
          )}
          {done && !error && (
            <p role="status" style={{ color: "var(--text-2)", fontSize: 13.5, margin: 0 }}>
              {done}
            </p>
          )}

          {notes.length > 0 && (
            <div>
              <h4 style={{ ...mono, margin: "6px 0 8px" }}>Notes</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {notes.map((n) => (
                  <li key={n.id} style={{ fontSize: 13.5, lineHeight: 1.55, borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
                    {n.timecode !== null &&
                      (knowsTime ? (
                        <button
                          type="button"
                          className="pill pill-accent"
                          onClick={() => seek(n.timecode!)}
                          style={{ marginRight: 6, cursor: "pointer", border: "none" }}
                          title="Jump to this moment"
                        >
                          {formatTimecode(n.timecode)}
                        </button>
                      ) : (
                        <span className="pill" style={{ marginRight: 6 }}>
                          {formatTimecode(n.timecode)}
                        </span>
                      ))}
                    {n.body}
                    <span style={{ display: "block", ...mono, marginTop: 2 }}>{n.mine ? "You" : "Your team"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
