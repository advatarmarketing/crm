"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addActivityNote, type SimpleState } from "@/app/app/clients/[id]/actions";

const initialState: SimpleState = { error: null, success: null };

export interface ActivityEntry {
  id: string;
  kind: string;
  summary: string;
  created_at: string;
  actorName: string | null;
}

// A dot colour per kind of event, so the timeline can be skimmed for
// "money" or "problem" without reading every line.
const KIND_COLOR: Record<string, string> = {
  client_created: "var(--text-3)",
  stage_changed: "var(--status-warm)",
  invoice_sent: "var(--status-warm)",
  invoice_paid: "var(--status-active)",
  document_uploaded: "var(--text-2)",
  document_deleted: "var(--text-3)",
  meeting_linked: "var(--status-active)",
  contact_logged: "var(--status-active)",
  note: "var(--text-2)",
};

function whenLabel(iso: string) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * What has happened to this client, newest first.
 *
 * Most entries are written automatically — some by server actions
 * (invoices, uploads, meetings), some by database triggers (created,
 * stage changed), because those can happen through paths that never
 * touch a server action. The note box is the one manual way in.
 */
export function ActivityTimeline({
  clientId,
  entries,
}: {
  clientId: string;
  entries: ActivityEntry[];
}) {
  const [state, formAction] = useFormState(addActivityNote, initialState);

  return (
    <div>
      <form action={formAction} style={{ marginBottom: 18 }}>
        <input type="hidden" name="clientId" value={clientId} />
        <textarea
          name="note"
          rows={2}
          placeholder="Add a note to this client's history…"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-1)",
            fontFamily: "var(--font-body)",
            resize: "vertical",
            marginBottom: 8,
          }}
        />
        {state.error && <p style={{ color: "var(--status-closed)", fontSize: 13, margin: "0 0 8px" }}>{state.error}</p>}
        <NoteButton />
      </form>

      {entries.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
          Nothing recorded yet. Activity will appear here as things happen.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {entries.map((entry, i) => (
            <li key={entry.id} style={{ display: "flex", gap: 12 }}>
              {/* dot + connecting line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: KIND_COLOR[entry.kind] ?? "var(--text-3)",
                    marginTop: 6,
                  }}
                />
                {i < entries.length - 1 && (
                  <span style={{ flex: 1, width: 1, background: "var(--border)", marginTop: 4 }} />
                )}
              </div>

              <div style={{ paddingBottom: 18, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--text-1)", lineHeight: 1.45 }}>
                  {entry.summary}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>
                  {whenLabel(entry.created_at)}
                  {entry.actorName ? ` · ${entry.actorName}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn">
      {pending ? "Adding…" : "Add note"}
    </button>
  );
}
