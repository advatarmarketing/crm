"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface TeamMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  authorName?: string | null;
}

/**
 * The internal thread about one client.
 *
 * Deliberately a different table from the portal conversation
 * (`message_threads` / `messages`): that one the client reads from
 * their own login. This one is the team talking among themselves, and
 * `client_team_messages` (0020) grants a client login no policy at
 * all — not a filter in the query, no access in the database.
 *
 * The wording under the heading says so plainly, because a team note
 * written in the belief that the client can't see it is exactly the
 * kind of thing that must not be guesswork.
 */
export function ClientTeamThread({
  clientId,
  initialMessages,
  currentUserId,
}: {
  clientId: string;
  initialMessages: TeamMessage[];
  currentUserId: string | null;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  async function send() {
    const trimmed = body.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("client_team_messages")
      .insert({ client_id: clientId, body: trimmed, author_id: currentUserId })
      .select("id, body, created_at, author_id")
      .single();

    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not send that.");
      return;
    }

    setMessages((prev) => [...prev, { ...(data as TeamMessage), authorName: "You" }]);
    setBody("");
    router.refresh();
  }

  return (
    <div>
      {messages.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          Nothing here yet. This is the place for notes about this client that
          the client themselves never sees.
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: "0 0 14px",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          {messages.map((m) => {
            const mine = m.author_id === currentUserId;
            return (
              <li
                key={m.id}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderLeft: mine ? "3px solid var(--text-1)" : "3px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: mine ? "var(--surface-2)" : "var(--surface)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13.5,
                    color: "var(--text-1)",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.55,
                  }}
                >
                  {m.body}
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-3)",
                    marginTop: 5,
                  }}
                >
                  {(mine ? "You" : m.authorName?.trim() || "Someone")} ·{" "}
                  {new Date(m.created_at).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 8px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, shift+Enter makes a new line — the way
            // every chat box behaves.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Message the team about this client…"
          style={{ ...field, flex: "1 1 240px", resize: "vertical" }}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !body.trim()}
          className="btn btn-primary"
          style={{ alignSelf: "flex-start", flexShrink: 0 }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

const field = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  minWidth: 0,
};
