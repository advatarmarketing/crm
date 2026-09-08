"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Teammate {
  id: string;
  name: string;
  role: string;
  unread: number;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read: boolean;
  created_at: string;
}

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  operations_manager: "Ops manager",
  staff: "Staff",
  videographer: "Videographer",
};

/**
 * One-to-one messaging with the rest of the team.
 *
 * Pick a person, see that conversation. `direct_messages` (0021) lets
 * only the two people involved read a message — there is deliberately
 * no management override, so this is genuinely between the two of
 * them, and client logins are excluded on both ends.
 *
 * Messages for the selected person are fetched on open rather than
 * all preloaded: a team's full message history is not something to
 * ship to the browser to render one thread.
 */
export function TeamDirectMessages({
  teammates,
  currentUserId,
}: {
  teammates: Teammate[];
  currentUserId: string;
}) {
  const [selected, setSelected] = useState<Teammate | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadByPerson, setUnreadByPerson] = useState(
    new Map(teammates.map((t) => [t.id, t.unread]))
  );

  const supabase = createClient();
  const router = useRouter();

  async function openConversation(person: Teammate) {
    setSelected(person);
    setLoading(true);
    setError(null);
    setMessages([]);

    const { data, error: loadError } = await supabase
      .from("direct_messages")
      .select("id, sender_id, recipient_id, body, read, created_at")
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${person.id}),` +
          `and(sender_id.eq.${person.id},recipient_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setMessages((data ?? []) as unknown as DirectMessage[]);

    // Mark their messages to me as read. Only the recipient may do
    // this, which is exactly who this is.
    const unread = ((data ?? []) as unknown as DirectMessage[]).filter(
      (m) => m.recipient_id === currentUserId && !m.read
    );
    if (unread.length > 0) {
      await supabase
        .from("direct_messages")
        .update({ read: true })
        .in(
          "id",
          unread.map((m) => m.id)
        );
      setUnreadByPerson((prev) => new Map(prev).set(person.id, 0));
      router.refresh();
    }
  }

  async function send() {
    if (!selected) return;
    const trimmed = body.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);

    const { data, error: sendError } = await supabase
      .from("direct_messages")
      .insert({ sender_id: currentUserId, recipient_id: selected.id, body: trimmed })
      .select("id, sender_id, recipient_id, body, read, created_at")
      .single();

    setBusy(false);

    if (sendError || !data) {
      setError(sendError?.message ?? "Could not send that.");
      return;
    }

    setMessages((prev) => [...prev, data as unknown as DirectMessage]);
    setBody("");
  }

  if (teammates.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
        Nobody else on the team yet.
      </p>
    );
  }

  return (
    <div className="dm-layout">
      <div style={{ minWidth: 0 }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {teammates.map((t) => {
            const unread = unreadByPerson.get(t.id) ?? 0;
            const active = selected?.id === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openConversation(t)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: active ? "var(--surface-2)" : "var(--surface)",
                    borderLeft: active ? "3px solid var(--text-1)" : "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>
                      {t.name}
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                      {ROLE_LABEL[t.role] ?? t.role}
                    </span>
                  </span>

                  {unread > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--bg)",
                        background: "var(--text-1)",
                        borderRadius: 20,
                        padding: "2px 7px",
                        flexShrink: 0,
                      }}
                    >
                      {unread}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ minWidth: 0 }}>
        {!selected ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            Pick someone to start a conversation.
          </p>
        ) : (
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 12px" }}>{selected.name}</h3>

            {loading ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>Loading…</p>
            ) : messages.length === 0 ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
                No messages yet. Say hello.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "0 0 12px",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  maxHeight: 420,
                  overflowY: "auto",
                }}
              >
                {messages.map((m) => {
                  const mine = m.sender_id === currentUserId;
                  return (
                    <li
                      key={m.id}
                      style={{
                        alignSelf: mine ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        padding: "9px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: mine ? "var(--text-1)" : "var(--surface)",
                        color: mine ? "var(--bg)" : "var(--text-1)",
                        border: mine ? "none" : "1px solid var(--border)",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {m.body}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9.5,
                          opacity: 0.65,
                          marginTop: 4,
                        }}
                      >
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
                placeholder={`Message ${selected.name}…`}
                style={{ ...field, flex: "1 1 200px", resize: "vertical" }}
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
        )}
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
