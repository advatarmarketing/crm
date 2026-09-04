"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function loadCount() {
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
    }

    loadCount();

    const channel = supabase
      .channel("messages-nav-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadCount())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

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
