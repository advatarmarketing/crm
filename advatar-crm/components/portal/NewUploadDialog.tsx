"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface NewUploadAlert {
  /** The notification rows this covers, so they can be marked read. */
  ids: string[];
  /** Where the button goes. */
  href: string;
  /** Their first name, already worked out on the server. */
  firstName: string;
  /** How many new videos are waiting. */
  count: number;
}

/**
 * "New Upload!" — shown to a client the first time they land after
 * something has been shared with them.
 *
 * Driven by the `notifications` rows the share already writes (0028's
 * submissions_shared_notify, and notifyClient at submit time), rather
 * than by a second mechanism of its own. That means it cannot
 * disagree with the bell beside it, and it answers "has this person
 * been told yet" with the same row that answers it everywhere else.
 *
 * Dismissing marks those rows read, so it appears once rather than on
 * every page they open. If marking read fails — offline, a policy
 * change — the dialog still closes: a client stuck behind a modal
 * they cannot get rid of would be far worse than seeing it twice.
 */
export function NewUploadDialog({ alert }: { alert: NewUploadAlert | null }) {
  /**
   * The notifications this viewer has already waved away, as a key.
   *
   * Deliberately NOT an `open` boolean flipped by an effect. `alert`
   * is rebuilt by the layout on every server render, so it is a new
   * object each time — an effect keyed on it re-ran on every
   * re-render and set open back to true. Dismissing calls
   * router.refresh(), which is a re-render, so the dialog reopened
   * the instant it was closed. Browser-verified: it would not go
   * away.
   *
   * Keyed on the ids rather than the object, so what decides whether
   * this has been seen is which notifications it is about, not which
   * render produced it.
   */
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  // Not on the page it would send them to — they are already looking
  // at the thing it wants to show them.
  const onTheUploadsPage = pathname?.startsWith("/app/portal/uploads") ?? false;

  const key = alert ? alert.ids.join(",") : "";
  const open = Boolean(alert) && key !== "" && key !== dismissedKey && !onTheUploadsPage;

  if (!alert || !open) return null;

  async function dismiss(thenGo: boolean) {
    if (busy) return;
    setBusy(true);

    // Closed first, before the write. Marking the rows read is the
    // tidy-up; getting out of the way is what the person asked for,
    // and it should not wait on a round trip.
    setDismissedKey(key);

    try {
      await supabase.from("notifications").update({ read: true }).in("id", alert!.ids);
    } catch {
      // Deliberately ignored — see the note above.
    }

    setBusy(false);

    if (thenGo) {
      router.push(alert!.href);
    } else {
      // So the bell beside the nav drops its count at the same moment
      // the dialog goes, rather than a page later.
      router.refresh();
    }
  }

  const many = alert.count > 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-upload-title"
      onClick={(e) => {
        // Only the backdrop itself, not a click that happened to
        // bubble up out of the card.
        if (e.target === e.currentTarget) dismiss(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "rgba(0, 0, 0, 0.5)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "26px 24px 22px",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.28)",
        }}
      >
        <h2
          id="new-upload-title"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            letterSpacing: "0.01em",
            color: "var(--text-1)",
            margin: "0 0 10px",
          }}
        >
          {many ? `${alert.count} new uploads!` : "New Upload!"}
        </h2>

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "var(--text-2)",
            margin: "0 0 22px",
          }}
        >
          Please check {many ? "them" : "it"} out {alert.firstName} and please let us
          know what you think 👍
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => dismiss(true)}
            disabled={busy}
            className="btn btn-primary"
            style={{ flex: "1 1 auto" }}
          >
            {many ? "Watch them" : "Watch it"}
          </button>
          <button type="button" onClick={() => dismiss(false)} disabled={busy} className="btn">
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
