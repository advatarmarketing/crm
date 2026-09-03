export interface ChatMessage {
  id: string;
  body: string;
  sender_id: string | null;
  sender_role: string | null;
  read: boolean;
  created_at: string;
}

/**
 * Phase 10: shared, presentational only — no data-fetching, no
 * realtime, just renders whatever list it's handed. Used by both
 * ChatShell (staff/ceo/videographer) and the client portal's message
 * page, each of which owns its own live `messages` state and passes
 * it down.
 */
export function MessageBubbleList({ messages, currentUserId }: { messages: ChatMessage[]; currentUserId: string }) {
  if (messages.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", padding: "24px 0" }}>
        No messages yet.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {messages.map((m) => {
        const own = m.sender_id === currentUserId;
        return (
          <div
            key={m.id}
            style={{
              alignSelf: own ? "flex-end" : "flex-start",
              maxWidth: "72%",
              background: own ? "var(--text-1)" : "var(--surface)",
              color: own ? "var(--bg)" : "var(--text-1)",
              border: own ? "none" : "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: own ? "var(--bg)" : "var(--text-3)",
                opacity: 0.75,
                marginBottom: 3,
              }}
            >
              {m.sender_role ?? "—"} · {new Date(m.created_at).toLocaleString()}
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.4 }}>{m.body}</div>
          </div>
        );
      })}
    </div>
  );
}
