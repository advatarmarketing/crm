"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

/**
 * The bell, for every role.
 *
 * Rows are read under the caller's own session and `notifications`
 * grants select on your own rows only (0025), so there is no filtering
 * to get wrong here — a query for "all notifications" returns yours.
 *
 * Opening the panel marks what is in it as read. That matches what
 * people expect from a bell and avoids a second "mark all" control
 * nobody presses.
 */
export function NotificationBell({ initial }: { initial: AppNotification[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();
  const router = useRouter();

  const unread = items.filter((n) => !n.read).length;

  // Close on an outside click or Escape. Without this the panel stays
  // open behind whatever you clicked next.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);

    if (!next) return;

    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setItems((prev) => prev.map((n) => ({ ...n, read: true }))); // optimistic

    const { error } = await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    if (!error) router.refresh();
  }

  return (
    <div style={{ position: "relative", flexShrink: 0 }} ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-2)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>

        {unread > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: "0 4px",
              borderRadius: "var(--radius-pill)",
              background: "var(--danger-fg)",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              lineHeight: "17px",
              textAlign: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: 44,
            right: 0,
            width: 330,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 60,
            padding: 8,
          }}
        >
          {items.length === 0 ? (
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--text-3)",
                textAlign: "center",
                padding: "22px 12px",
                margin: 0,
              }}
            >
              Nothing yet. You&rsquo;ll hear about new clients, tasks and deadlines here.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((n) => {
                const inner = (
                  <>
                    <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.4 }}>
                      {n.title}
                    </span>
                    {n.body && (
                      <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)", marginTop: 3, lineHeight: 1.45 }}>
                        {n.body}
                      </span>
                    )}
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)", marginTop: 5 }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </>
                );

                const style = {
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                  background: n.read ? "transparent" : "var(--accent-soft)",
                } as const;

                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} style={style} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      <div style={style}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** "4m ago" reads better than a timestamp for something this recent. */
function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
