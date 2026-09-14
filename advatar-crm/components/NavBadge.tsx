"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * The little numbered circle beside a tab.
 *
 * It counts this person's unread notifications whose `href` sits under
 * the tab's path — so the Uploads badge is literally "the unread
 * things that would take you to Uploads". Two consequences, both
 * deliberate:
 *
 *   - a badge can never disagree with the bell, because they read the
 *     same rows, and
 *   - adding a badge to another tab needs no counting code at all,
 *     only a notification whose href points at that tab.
 *
 * `notifications` has an "own rows" select policy (0025), so the query
 * needs no user filter: RLS already guarantees you only count your
 * own. Which is also why the subscription below is safe unfiltered —
 * the same reliance on RLS-scoped Realtime payloads that ChatShell and
 * MessagesNavBadge already make.
 *
 * ---------------------------------------------------------------
 * Why there is a store here rather than a fetch per badge
 * ---------------------------------------------------------------
 * Every tab in the nav can carry one, and the nav is mounted twice at
 * once — the desktop row is hidden with CSS, not unmounted, so opening
 * the phone menu mounts a second copy of every link. A badge that did
 * its own query and opened its own Realtime channel would mean around
 * twenty-six channels and twenty-six count queries per page load, for
 * one number each.
 *
 * So: one query, one channel, shared. Every badge reads the same list
 * of unread hrefs and counts the ones under its own prefix.
 */

type Listener = () => void;

let hrefs: string[] = [];
let listeners: Listener[] = [];
let started = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let channel: any = null;

function emit() {
  for (const listener of listeners) listener();
}

async function refresh() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("href")
      .eq("read", false)
      // A cap, because this is a badge: nobody distinguishes 400 from
      // 500 unread items, and the query should stay cheap.
      .limit(500);

    // A missing table (0025 not run) arrives as an error rather than a
    // throw. Either way the badges stay hidden — which is the right
    // answer for a database that doesn't have notifications yet.
    if (error) return;

    hrefs = ((data ?? []) as { href: string | null }[])
      .map((row) => row.href)
      .filter((h): h is string => !!h);

    emit();
  } catch {
    // Keep whatever we had.
  }
}

function start() {
  if (started) return;
  started = true;

  refresh();

  try {
    const supabase = createClient();
    channel = supabase
      .channel("nav-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => refresh())
      .subscribe();
  } catch {
    // Live updates lost; the list still loaded once above. A badge is
    // the least important thing on the screen and must never be able
    // to break the navigation.
    channel = null;
  }
}

function subscribe(listener: Listener) {
  listeners.push(listener);
  start();
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

/** Re-read the unread list now — used after marking a section seen. */
export function refreshNavBadges() {
  refresh();
}

export function NavBadge({ prefix, label = "updates" }: { prefix: string; label?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const recount = () => {
      setCount(hrefs.filter((h) => h === prefix || h.startsWith(`${prefix}/`)).length);
    };

    recount();
    return subscribe(recount);
  }, [prefix]);

  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // A circle at one digit, a pill at two or three — rather than
        // a circle that squashes the number out of shape.
        minWidth: 17,
        height: 17,
        borderRadius: 999,
        background: "var(--accent)",
        color: "var(--text-on-accent)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        lineHeight: 1,
        fontWeight: 600,
        padding: "0 5px",
        marginLeft: 7,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Marks a section's notifications read on arrival.
 *
 * Rendered by the page the badge points at. Without it the count would
 * only ever go up: opening Uploads is what "I have seen these" means,
 * and asking someone to also tick each one off in the bell would make
 * the badge a chore rather than a signal.
 *
 * Runs under the caller's own session, so `notifications`' "mark own
 * read" policy is what permits it — this could not touch anybody
 * else's rows even if the prefix were wrong.
 */
export function MarkSectionSeen({ prefix }: { prefix: string }) {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        // `like` with a trailing % so /app/uploads also clears
        // /app/uploads/anything, matching what NavBadge counts.
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .like("href", `${prefix}%`);

        if (!cancelled) refreshNavBadges();
      } catch {
        // The badge stays up. Harmless, and better than a crash on a
        // page somebody came here to read.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prefix]);

  return null;
}
