"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/lib/messaging/actions";

/**
 * Phase 10: renders nothing — fires `markThreadRead` once whenever
 * `threadId` changes (i.e. whenever a thread is "opened"), which is
 * the literal trigger the brief asks for. Also re-fires the effect's
 * `tick` dependency changes without `threadId` itself changing (see
 * ChatShell/the client portal page): that lets "a new message just
 * arrived while I already have this thread open" re-run the same
 * mark-as-read call, so the unread count stays accurate for someone
 * actively looking at the conversation, not just at the moment they
 * first opened it.
 */
export function MarkThreadRead({ threadId, tick = 0 }: { threadId: string | null; tick?: number }) {
  useEffect(() => {
    if (!threadId) return;
    markThreadRead(threadId);
    // `tick` is intentionally in the dependency array with no other
    // use — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, tick]);

  return null;
}
