"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { linkFathomMeeting, type SimpleState } from "@/app/app/clients/[id]/actions";
import { formatDate } from "@/lib/format";

const initialState: SimpleState = { error: null, success: null };

export interface LinkedMeeting {
  id: string;
  title: string | null;
  meeting_url: string | null;
  summary: string | null;
  received_at: string | null;
  source: string | null;
}

/**
 * Attach a Fathom meeting to this client.
 *
 * Being straight about what this does: Fathom's API isn't wired into
 * this project, so nothing here reaches out to Fathom and pulls a
 * recording down. What it does is let you paste the recording link and
 * the summary text — the two things you can actually copy out of
 * Fathom — and file them against this client exactly as the webhook
 * would, including running the notes through the same mapper that
 * builds a draft 90-day plan.
 *
 * If Fathom API credentials are added later, this form becomes the
 * fallback rather than the only route.
 */
export function FathomLinkPanel({
  clientId,
  meetings,
}: {
  clientId: string;
  meetings: LinkedMeeting[];
}) {
  const [state, formAction] = useFormState(linkFathomMeeting, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div>
      {meetings.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          No meetings attached yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {meetings.map((m) => (
            <li
              key={m.id}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
                  {m.title || "Meeting"}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", textTransform: "uppercase" }}>
                  {m.source === "manual" ? "attached by hand" : "from fathom"} · {formatDate(m.received_at)}
                </span>
              </div>
              {m.summary && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontFamily: "var(--font-body)",
                    fontSize: 12.5,
                    color: "var(--text-2)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.summary.length > 400 ? `${m.summary.slice(0, 400)}…` : m.summary}
                </p>
              )}
              {m.meeting_url && (
                <a
                  href={m.meeting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-2)",
                  }}
                >
                  Open recording ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          + Connect a Fathom meeting
        </button>
      ) : (
        <form action={formAction} style={{ marginTop: 4 }}>
          <input type="hidden" name="clientId" value={clientId} />

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={labelStyle}>Meeting title</span>
            <input name="title" style={inputStyle} placeholder="e.g. Discovery call" />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={labelStyle}>Fathom recording link</span>
            <input name="meetingUrl" style={inputStyle} placeholder="https://fathom.video/..." />
          </label>

          <label style={{ display: "block", marginBottom: 12 }}>
            <span style={labelStyle}>Summary or notes</span>
            <textarea
              name="notes"
              rows={6}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Paste the Fathom summary and action items here. If this client has no 90-day plan yet, one will be drafted from it."
            />
          </label>

          {state.error && <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 10 }}>{state.error}</p>}
          {state.success && <p style={{ color: "var(--status-active)", fontSize: 13, marginBottom: 10 }}>{state.success}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <SubmitButton />
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "Attaching…" : "Attach meeting"}
    </button>
  );
}
