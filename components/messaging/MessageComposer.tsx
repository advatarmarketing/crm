"use client";

import { useState } from "react";
import { sendMessage } from "@/lib/messaging/actions";

/**
 * Phase 10: shared by both ChatShell (staff/ceo/videographer) and the
 * client portal's message page. Deliberately has no optimistic
 * append — it only calls the `sendMessage` server action and clears
 * itself on success. The message you just sent shows up in the
 * thread once the Realtime `postgres_changes` insert event for it
 * comes back to your own subscription (see ChatShell's comment on
 * why), same as anyone else's message — typically near-instant, but
 * worth knowing this isn't a zero-latency optimistic-UI pattern.
 */
export function MessageComposer({
  threadId,
  onBeforeSend,
  disabled = false,
  disabledMessage,
}: {
  /** Null when no thread exists yet for this client. */
  threadId: string | null;
  /**
   * Called right before sending when `threadId` is null — gives the
   * caller (ChatShell, for ceo/staff) a chance to create the thread
   * first and hand back its id. Return null to abort the send (e.g.
   * thread creation failed, or the caller isn't allowed to create
   * one).
   */
  onBeforeSend?: () => Promise<string | null>;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabled) {
    return (
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", padding: "12px 0" }}>
        {disabledMessage ?? "Sending isn't available for this conversation yet."}
      </p>
    );
  }

  // Takes no event — both the form's onSubmit and the textarea's
  // Enter-to-send onKeyDown call this the same way, each handling its
  // own event type's preventDefault() itself rather than this
  // function needing to accept either a FormEvent or a
  // KeyboardEvent.
  async function doSend() {
    const body = value.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    let targetThreadId = threadId;
    if (!targetThreadId && onBeforeSend) {
      targetThreadId = await onBeforeSend();
    }
    if (!targetThreadId) {
      setSending(false);
      setError("Couldn't start this conversation.");
      return;
    }

    const result = await sendMessage(targetThreadId, body);
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setValue("");
  }

  return (
    <div style={{ padding: "12px 0 0" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSend();
        }}
        style={{ display: "flex", gap: 8, alignItems: "flex-end" }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              doSend();
            }
          }}
          placeholder="Write a message…"
          rows={2}
          style={{
            flex: 1,
            resize: "none",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-1)",
          }}
        />
        <button
          type="submit"
          disabled={sending || !value.trim()}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "10px 16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--text-1)",
            background: "var(--text-1)",
            color: "var(--bg)",
            cursor: sending || !value.trim() ? "default" : "pointer",
            opacity: sending || !value.trim() ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {error && (
        <p style={{ margin: "6px 0 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-warm, #c0392b)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
