"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Phase 10: live unread-message count for the nav's "Messages" link —
 * ceo, staff, and videographer all render this (the brief named
 * staff/videographer explicitly; ceo gets the same "Messages" link +
 * badge for the same reason ceo/staff share every other nav item and
 * page in this app). Deliberately does its own tiny fetch + Realtime
 * subscription rather than being fed a count as a prop from a server
 * component: AppNav (and the app/app/layout.tsx that renders it) sits
 * above every /app/* page, including ones with nothing to do with
 * messaging, so it has no natural server-fetched data to receive this
 * from — a self-contained client component is the option that doesn't
 * require every page in the app to also fetch an unread count "just
 * in case" the nav needs it.
 *
 * "Unread" here means exactly what it means everywhere else in this
 * feature (ChatShell, markThreadRead): `read = false` and not sent by
 * me. The query has no `client_id`/`thread_id` filter of any kind —
 * RLS on `messages` (Phase 3 + 0007_messaging.sql) is what scopes the
 * result to whatever threads this role can actually see, the exact
 * same reliance on RLS-scoped Realtime payloads ChatShell's own
 * unfiltered subscription uses (see its comment for why that's safe).
 */
export function MessagesNavBadge() {
  const [count, setCount] = useState(0);
  // Phase 18 fix: the channel name has to be unique PER INSTANCE.
  //
  // Since the nav gained a mobile menu, two copies of this badge are
  // mounted at once — the desktop row is only hidden with CSS, not
  // unmounted, so opening the menu mounts a second one. Both used to
  // subscribe to a channel literally named "messages-nav-badge", and
  // @supabase/ssr hands every component the same browser client, so
  // the second subscribe threw ("tried to subscribe multiple times")
  // and took the whole page down with it — which is exactly the
  // "client-side exception" you got when tapping the menu on a phone.
  const instanceId = useId();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadCount() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { count: c } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("read", false)
          .neq("sender_id", user.id);
        if (!cancelled) setCount(c ?? 0);
      } catch {
        // Leave the count as it is rather than crashing the nav.
      }
    }

    loadCount();

    // Belt and braces: even with a unique name, a realtime failure
    // must never be able to break the navigation. An unread badge is
    // the least important thing on the screen.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`messages-nav-badge:${instanceId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadCount())
        .subscribe();
    } catch {
      // Live updates are lost; the count still loaded once above.
    }

    return () => {
      cancelled = true;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* already gone */
        }
      }
    };
  }, [instanceId]);

  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} unread messages`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 15,
        height: 15,
        borderRadius: 8,
        background: "var(--status-warm, #c0392b)",
        color: "var(--text-on-accent)",
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        padding: "0 4px",
        marginLeft: 6,
        verticalAlign: "middle",
      }}
    >
      {count}
    </span>
  );
}
