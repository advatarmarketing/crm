"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureThreadForClient } from "@/lib/messaging/actions";
import { MessageBubbleList, type ChatMessage } from "@/components/messaging/MessageBubbleList";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { MarkThreadRead } from "@/components/messaging/MarkThreadRead";

export interface ChatThreadSeed {
  clientId: string;
  clientName: string;
  clientAvatarUrl: string | null;
  /** Null when no `message_threads` row exists for this client yet. */
  threadId: string | null;
  lastMessage: { body: string; createdAt: string; senderRole: string | null } | null;
  unreadCount: number;
}

/**
 * Phase 10: the staff/ceo/videographer chat UI, at /app/messages.
 * One thread per client, "one per client" meaning literally that:
 * `initialThreads` is built from a query against `clients` (not
 * `message_threads`), so a client with no conversation yet still
 * shows up in the list with an empty pane, rather than only showing
 * up once someone's sent them a first message.
 *
 * The exact same component renders for ceo, staff, and videographer —
 * there is no `role` branch anywhere in here except
 * `canCreateThreads` (only ceo/staff may call `ensureThreadForClient`,
 * enforced for real by 0007_messaging.sql's RLS on `message_threads`,
 * this prop just decides whether to try). The actual difference in
 * what each role sees comes entirely from the initial query in
 * app/app/messages/page.tsx, which is RLS-scoped by the same
 * `clients`/`message_threads` policies used everywhere else in this
 * app — a videographer's `initialThreads` prop literally only
 * contains their assigned clients before this component ever runs.
 *
 * Realtime design: ONE subscription, unfiltered, on `messages`
 * (insert + update) and `message_threads` (insert). "Unfiltered" is
 * deliberate here, unlike PortalLayout's per-client filters (Phase
 * 9) — this component can be looking at dozens of clients' threads
 * at once for a busy staff account, so there's no single `client_id`
 * to filter by. Realtime's `postgres_changes` payloads are filtered
 * by the table's own RLS `select` policy for the subscribing user
 * regardless of the channel's own filter (see Phase 9's README), so
 * an unfiltered channel here still only ever receives events for
 * threads/messages this role's RLS already lets it read — the
 * channel filter is a narrowing convenience on top of that, not a
 * substitute for it, and with an unbounded set of clients to watch,
 * skipping it is the right call rather than trying to enumerate every
 * thread id into one filter string.
 */
export function ChatShell({
  currentUserId,
  canCreateThreads,
  initialThreads,
}: {
  currentUserId: string;
  canCreateThreads: boolean;
  initialThreads: ChatThreadSeed[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialThreads[0]?.clientId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [markReadTick, setMarkReadTick] = useState(0);

  const selectedThreadId = useMemo(
    () => threads.find((t) => t.clientId === selectedClientId)?.threadId ?? null,
    [threads, selectedClientId]
  );
  const selectedThreadIdRef = useRef<string | null>(null);
  selectedThreadIdRef.current = selectedThreadId;

  // ---------------- fetch messages for whichever thread is open ----------------
  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("messages")
        .select("id, body, sender_id, sender_role, read, created_at")
        .eq("thread_id", selectedThreadId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setMessages((data ?? []) as ChatMessage[]);
        setMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId]);

  // ---------------- scroll the open thread to its latest message ----------------
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, selectedThreadId]);

  // ---------------- realtime ----------------
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-shell:${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as ChatMessage;

        setThreads((prev) =>
          prev.map((t) => {
            if (t.threadId !== msg.thread_id) return t;
            const isOpen = selectedThreadIdRef.current === msg.thread_id;
            const bumpUnread = msg.sender_id !== currentUserId && !isOpen;
            return {
              ...t,
              lastMessage: { body: msg.body, createdAt: msg.created_at, senderRole: msg.sender_role },
              unreadCount: bumpUnread ? t.unreadCount + 1 : t.unreadCount,
            };
          })
        );

        if (selectedThreadIdRef.current === msg.thread_id) {
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          // A new message just arrived for the thread I already have
          // open — re-run mark-as-read so my unread count for it
          // stays accurate while I'm actively looking at it, not just
          // at the moment I first opened it.
          if (msg.sender_id !== currentUserId) {
            setMarkReadTick((x) => x + 1);
          }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as ChatMessage;
        const old = payload.old as Partial<ChatMessage>;

        if (selectedThreadIdRef.current === msg.thread_id) {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, read: msg.read } : m)));
        }

        // `old.read` is only populated because messages has
        // REPLICA IDENTITY FULL (0008_enable_realtime_threads.sql) —
        // without it, `old` would only carry the primary key and this
        // delta couldn't be computed at all.
        if (msg.sender_id !== currentUserId && typeof old?.read === "boolean" && old.read !== msg.read) {
          const delta = msg.read ? -1 : 1;
          setThreads((prev) =>
            prev.map((t) => (t.threadId === msg.thread_id ? { ...t, unreadCount: Math.max(0, t.unreadCount + delta) } : t))
          );
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_threads" }, (payload) => {
        const thread = payload.new as { id: string; client_id: string };
        setThreads((prev) => prev.map((t) => (t.clientId === thread.client_id ? { ...t, threadId: t.threadId ?? thread.id } : t)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  function selectThread(clientId: string) {
    setSelectedClientId(clientId);
    // Optimistic: the reader is looking at this thread right now.
    // The real mark-as-read call (MarkThreadRead below) and its
    // Realtime echo will settle the exact count shortly after.
    setThreads((prev) => prev.map((t) => (t.clientId === clientId ? { ...t, unreadCount: 0 } : t)));
  }

  async function handleBeforeSend(): Promise<string | null> {
    if (!canCreateThreads || !selectedClientId) return null;
    const { threadId } = await ensureThreadForClient(selectedClientId);
    if (!threadId) return null;
    setThreads((prev) => prev.map((t) => (t.clientId === selectedClientId ? { ...t, threadId } : t)));
    return threadId;
  }

  const sorted = useMemo(
    () =>
      [...threads].sort((a, b) => {
        const at = a.lastMessage?.createdAt ?? "";
        const bt = b.lastMessage?.createdAt ?? "";
        return bt.localeCompare(at);
      }),
    [threads]
  );

  const selected = threads.find((t) => t.clientId === selectedClientId) ?? null;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)" }}>
      <aside style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            margin: 0,
            padding: "20px 20px 14px",
          }}
        >
          Messages
        </h1>
        {sorted.length === 0 ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", padding: "0 20px" }}>
            No clients yet.
          </p>
        ) : (
          sorted.map((t) => {
            const initial = t.clientName.trim().charAt(0).toUpperCase() || "?";
            const active = t.clientId === selectedClientId;
            return (
              <button
                key={t.clientId}
                type="button"
                onClick={() => selectThread(t.clientId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 20px",
                  background: active ? "var(--surface-2, var(--surface))" : "transparent",
                  border: "none",
                  borderLeft: active ? "3px solid var(--text-1)" : "3px solid transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: t.clientAvatarUrl ? `center/cover no-repeat url(${t.clientAvatarUrl})` : "var(--surface-3, var(--border))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-display)",
                    fontSize: 15,
                    color: "var(--text-2)",
                  }}
                >
                  {!t.clientAvatarUrl && initial}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: t.unreadCount > 0 ? 700 : 600,
                        fontSize: 14,
                        color: "var(--text-1)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.clientName}
                    </span>
                    {t.unreadCount > 0 && (
                      <span
                        aria-label={`${t.unreadCount} unread`}
                        style={{
                          flexShrink: 0,
                          minWidth: 16,
                          height: 16,
                          borderRadius: 8,
                          background: "var(--status-warm, #c0392b)",
                          color: "#fff",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 4px",
                        }}
                      >
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      color: "var(--text-3)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {t.lastMessage ? t.lastMessage.body : "No messages yet"}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </aside>

      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>
            Select a client to see their conversation.
          </div>
        ) : (
          <>
            <MarkThreadRead threadId={selected.threadId} tick={markReadTick} />
            <header style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>{selected.clientName}</h2>
            </header>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {messagesLoading ? (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>Loading…</p>
              ) : (
                <MessageBubbleList messages={messages} currentUserId={currentUserId} />
              )}
            </div>
            <div style={{ padding: "0 24px 20px" }}>
              <MessageComposer
                threadId={selected.threadId}
                onBeforeSend={handleBeforeSend}
                disabled={!selected.threadId && !canCreateThreads}
                disabledMessage="This client doesn't have a conversation started yet."
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
