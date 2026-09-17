"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatTimecode, parseTimecode, type FeedbackAudience, type UploadNote } from "@/lib/uploads";
import { field, subheading, meta, errorText, safeObjectName } from "./styles";

const MAX_SHOT_BYTES = 5 * 1024 * 1024; // matches the bucket's own limit in 0028

/**
 * One conversation about one video.
 *
 * There are two of these per upload on the team's side and one on the
 * client's, which is the whole point of `audience`:
 *
 *   'team'   — the internal review. Where someone can say "the client
 *              will hate this opening" without the client reading it.
 *   'client' — the client's notes and the team's replies to them.
 *
 * The separation is enforced in Postgres, not here (0028): a client
 * has no select policy on team-audience rows and their insert policy
 * pins `audience` to 'client'. This component only decides which of
 * the two boxes you are typing into.
 *
 * A note can carry two optional extras, because these are the two
 * things people were writing out in prose anyway:
 *
 *   a timecode  — "1:23" typed while scrubbing, stored as seconds so
 *                 it sorts and renders consistently;
 *   a screenshot — a frame grab, which settles an argument about
 *                 framing in one go.
 *
 * Neither is required, and the form says so.
 */
export function FeedbackThread({
  submissionId,
  clientId,
  version,
  audience,
  notes,
  currentUserId,
  canPost,
  title,
  hint,
  placeholder,
}: {
  submissionId: string;
  clientId: string | null;
  version: number;
  audience: FeedbackAudience;
  notes: UploadNote[];
  currentUserId: string;
  canPost: boolean;
  title: string;
  hint: string;
  placeholder: string;
}) {
  const [body, setBody] = useState("");
  const [timecode, setTimecode] = useState("");
  const [shotPath, setShotPath] = useState<string | null>(null);
  const [shotName, setShotName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();
  const router = useRouter();

  /**
   * The screenshot goes browser -> Storage directly, before the note
   * is posted, so the note row carries a path that already exists.
   * The alternative — posting the note and then uploading — leaves a
   * note pointing at a file that may never arrive.
   *
   * If the note is then abandoned the object is orphaned. That is the
   * cheaper of the two failures: a stray 300 KB image nobody can
   * reach, against a note that renders a broken picture forever.
   */
  async function uploadShot(file: File) {
    setError(null);

    if (!clientId) {
      setError("This video has no client on it, so there's nowhere to file the screenshot.");
      return;
    }

    if (file.size > MAX_SHOT_BYTES) {
      setError("That image is over 5 MB. A screenshot should be well under it — try a PNG or JPEG grab.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Screenshots only — pick a PNG, JPEG or WebP.");
      return;
    }

    setUploading(true);
    try {
      // First path segment is the client id: every bucket in this app
      // keys its policies on that (see storage_path_client_id, 0016).
      const path = `${clientId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("feedback-shots")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      setShotPath(path);
      setShotName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeShot() {
    if (!shotPath) return;
    const path = shotPath;
    setShotPath(null);
    setShotName(null);
    try {
      await supabase.storage.from("feedback-shots").remove([path]);
    } catch {
      // The object stays; the note won't reference it.
    }
  }

  async function post() {
    const text = body.trim();
    if (!text) return;

    const seconds = timecode.trim() ? parseTimecode(timecode) : null;
    if (timecode.trim() && seconds === null) {
      setError("Write the time as 1:23, 0:45 or 1:02:03.");
      return;
    }

    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("submission_feedback").insert({
      submission_id: submissionId,
      version,
      body: text,
      audience,
      timecode_seconds: seconds,
      screenshot_path: shotPath,
      author_id: currentUserId,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setBody("");
    setTimecode("");
    setShotPath(null);
    setShotName(null);
    // The checklist is built by a trigger, so the refresh is what
    // makes it appear — there is nothing to add optimistically here
    // that wouldn't be a guess at what the splitter did.
    router.refresh();
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <span style={subheading}>{title}</span>
      <p style={{ ...meta, margin: "-4px 0 10px" }}>{hint}</p>

      {notes.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 10px" }}>
          Nothing here yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {notes.map((note) => (
            <li
              key={note.id}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--border)",
                // Your own notes carry the accent edge, so a thread
                // reads as a conversation rather than a wall.
                borderLeft: `3px solid ${note.authorId === currentUserId ? "var(--accent)" : "var(--border-2)"}`,
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
              }}
            >
              {note.timecode_seconds !== null && (
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: "var(--accent-fg, var(--text-1))",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-pill)",
                    padding: "2px 8px",
                    marginBottom: 6,
                  }}
                >
                  at {formatTimecode(note.timecode_seconds)}
                </span>
              )}

              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                  color: "var(--text-1)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.55,
                }}
              >
                {note.body}
              </span>

              {note.screenshotUrl && (
                <a href={note.screenshotUrl} target="_blank" rel="noopener noreferrer">
                  {/* Plain <img>: the URL is signed and short-lived,
                      so next/image's optimiser has nothing to cache
                      and would only add a hop that expires. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={note.screenshotUrl}
                    alt="Screenshot attached to this note"
                    style={{
                      display: "block",
                      marginTop: 8,
                      maxWidth: "100%",
                      maxHeight: 260,
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </a>
              )}

              <span style={{ ...meta, display: "block", marginTop: 6 }}>
                {[
                  note.authorName ?? "Someone",
                  note.version ? `on v${note.version}` : null,
                  new Date(note.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canPost && (
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={placeholder}
            style={{ ...field, width: "100%", resize: "vertical", marginBottom: 8 }}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={timecode}
              onChange={(e) => setTimecode(e.target.value)}
              placeholder="Time (optional) e.g. 1:23"
              aria-label="Where in the video this note is about — optional"
              style={{ ...field, width: 170 }}
            />

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadShot(file);
              }}
            />

            {shotPath ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...meta, color: "var(--ok-fg)" }}>
                  {shotName && shotName.length > 24 ? `${shotName.slice(0, 24)}…` : shotName}
                </span>
                <button type="button" onClick={removeShot} className="btn">
                  Remove
                </button>
              </span>
            ) : (
              <button type="button" className="btn" disabled={uploading} onClick={() => inputRef.current?.click()}>
                {uploading ? "Attaching…" : "+ Screenshot"}
              </button>
            )}

            <button
              type="button"
              onClick={post}
              disabled={busy || uploading || !body.trim()}
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>

          <p style={{ ...meta, margin: "8px 0 0" }}>
            A time and a screenshot are both optional — add them when a note is about one
            specific moment.
          </p>

          {error && <p style={errorText}>{error}</p>}
        </div>
      )}
    </div>
  );
}
