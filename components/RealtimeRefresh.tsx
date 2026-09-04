"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Phase 9: a small, render-nothing client component that subscribes
 * to one or more `postgres_changes` filters and calls
 * `router.refresh()` whenever any of them fire.
 *
 * Why this shape instead of copying PlannerDocument's approach
 * (fetch + hold state + patch it from the realtime payload): most of
 * the portal pages are plain server components reading Supabase
 * directly (the same convention as the rest of this app —
 * /app/dashboard, /app/clients, etc.), which keeps their data-fetching
 * simple and lets RLS do its job in one obvious place per page.
 * Duplicating PlannerDocument's client-side fetch/patch machinery into
 * every one of those pages just to get live updates would mean two
 * different ways of reading the same tables. `router.refresh()`
 * instead re-runs the current route's server components against the
 * database again — a real network round trip, not a cached replay —
 * without a full page reload or losing this component's own
 * subscription. That satisfies "no polling, no manual refresh" (the
 * refresh is automatic and event-driven, just not visible as a
 * spinner) while keeping every portal page's data-fetching ordinary.
 *
 * PlannerDocument keeps its own separate, finer-grained subscription
 * on `planners` for /app/portal/plan specifically — patching just the
 * changed JSON in place reads better for a document you might be
 * mid-scroll on than a full server round-trip would. Both this
 * component and PlannerDocument being subscribed to `planners` at
 * once for that one page is intentional, minor redundancy, not a bug:
 * this component's refresh also has to cover the *rest* of the
 * portal (e.g. the Overview page's "Plan: Published" stat, and the
 * Content Hub) reacting to the exact same publish event, which
 * PlannerDocument's own subscription has no way to do since it only
 * mounts on the plan page itself.
 *
 * Worth flagging (see README): Postgres Changes payloads are filtered
 * by the table's own RLS `select` policies for the subscribing user,
 * same as any other read — a client session's subscription can never
 * receive a row their RLS wouldn't already let them `select`, even
 * with a wide-open filter. The per-client `client_id=eq...`/
 * `thread_id=eq...` filters passed in below are belt-and-braces on
 * top of that (this project's usual pattern), not the only thing
 * preventing cross-client leakage here.
 */
export function RealtimeRefresh({
  channelName,
  subscriptions,
}: {
  /** Unique per mount point — becomes the Realtime channel name. */
  channelName: string;
  subscriptions: { table: string; filter: string }[];
}) {
  const router = useRouter();
  const subsKey = JSON.stringify(subscriptions);

  useEffect(() => {
    if (subscriptions.length === 0) return;

    const supabase = createClient();
    let channel = supabase.channel(channelName);

    for (const sub of subscriptions) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: sub.table, filter: sub.filter },
        () => router.refresh()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // subsKey (a JSON string) is the real dependency — subscriptions
    // itself is a fresh array/object identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, subsKey]);

  return null;
}
