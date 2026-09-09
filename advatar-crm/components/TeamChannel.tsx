"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface ChannelMessage {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  authorName?: string | null;
}

/**
 * The videographers' group channel.
 *
 * One conversation for the whole crew, rather than one-to-one — the
 * "kit is at the studio, who's got the gimbal" chat that otherwise
 * happens in a WhatsApp group nobody can search later.
 *
 * Membership is a role, not a members table (0025): everyone with a
 * videographer, staff, ops or CEO login is in it, and a client login
 * has no policy on the table at all. Management being in it is
 * deliberate — this is a work channel. The conversation that is
 * genuinely private is a direct message.
 */
export function TeamChannel({
  initialMessages,
  currentUserId,
  channel = "videographers",
}: {
  initialMessages: ChannelMessage[];
  currentUserId: string | null;
  channel?: string;
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
      .from("team_channel_messages")
      .insert({ channel, body: trimmed, author_id: currentUserId })
      .select("id, body, created_at, author_id")
      .single();

    setBusy(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Could not send that.");
      return;
    }

    setMessages((prev) => [...prev, { ...(data as ChannelMessage), authorName: "You" }]);
    setBody("");
    router.refresh();
  }

  return (
    <div>
      {messages.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          Nothing here yet. This one is for the whole crew — kit, cover,
          swapping days around.
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
            maxHeight: 460,
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Message the crew…"
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
