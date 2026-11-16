"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/components/NotificationBell";

/**
 * Notifications that slide in at the top right (the top of the screen
 * on a phone), like a message arriving on a phone. Tapping one takes
 * you straight to the thing it is about and marks it read.
 *
 * What shows:
 *   - on arrival, anything unread from the last three days that has not
 *     popped up on this device before — "you have a new video to watch"
 *     is the first thing a client sees after logging in;
 *   - anything new while the app is open, live where Supabase Realtime
 *     carries the table (0043 adds it), and otherwise within a minute,
 *     because this also checks quietly in the background.
 *
 * The bell keeps the full list; these are the nudge, not the record.
 */

const MAX_ON_SCREEN = 3;
const SHOW_FOR_MS = 9000;
const SEEN_KEY = "toasts.seen";
const RECENT_DAYS = 3;
const POLL_MS = 60_000;

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>) {
  try {
    // Only the newest few hundred: enough to never repeat one, not
    // enough to grow forever.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-300)));
  } catch {
    /* storage blocked: toasts may repeat on the next visit, nothing worse */
  }
}

export function NotificationToasts({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (items: AppNotification[]) => {
      const fresh = items.filter((n) => !n.read && !seen.current.has(n.id));
      if (fresh.length === 0) return;
      for (const n of fresh) seen.current.add(n.id);
      writeSeen(seen.current);
      setToasts((prev) => [...fresh, ...prev].slice(0, MAX_ON_SCREEN));
      for (const n of fresh) {
        timers.current.set(
          n.id,
          setTimeout(() => dismiss(n.id), SHOW_FOR_MS)
        );
      }
    },
    [dismiss]
  );

  const check = useCallback(async () => {
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, href, read, created_at")
      .eq("read", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ON_SCREEN);
    if (data) push(data as AppNotification[]);
  }, [supabase, push]);

  useEffect(() => {
    seen.current = readSeen();
    // A moment after the page settles, so the toast "pulls down" onto a
    // page the person can already see rather than during the paint.
    const first = setTimeout(check, 700);
    const poll = setInterval(check, POLL_MS);

    const channel = supabase
      .channel(`toasts:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: AppNotification }) => push([payload.new])
      )
      .subscribe();

    const all = timers.current;
    return () => {
      clearTimeout(first);
      clearInterval(poll);
      supabase.removeChannel(channel);
      for (const t of all.values()) clearTimeout(t);
    };
  }, [supabase, userId, check, push]);

  async function open(n: AppNotification) {
    dismiss(n.id);
    await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    if (n.href) router.push(n.href);
    router.refresh();
  }

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-label="New notifications">
      {toasts.map((n) => (
        <div key={n.id} className="toast" role="status">
          <button type="button" className="toast-main" onClick={() => open(n)}>
            <span className="toast-dot" aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <span className="toast-title">{n.title}</span>
              {n.body && <span className="toast-body">{n.body}</span>}
              {n.href && <span className="toast-cta">Tap to open →</span>}
            </span>
          </button>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
