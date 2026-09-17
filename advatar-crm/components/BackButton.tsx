"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Back, for the installed app.
 *
 * Added because the CRM's manifest sets `display: "standalone"` — the
 * point of which is that it opens without Safari's or Chrome's chrome
 * around it. That also removes the browser's back button, and on a
 * phone there is no keyboard shortcut and no swipe on every device to
 * fall back to, so anyone who tapped into a client, a lead or an
 * upload had no way back except the menu.
 *
 * Three things decide whether it shows:
 *
 *   - Phone widths only (.nav-back in globals.css). On a desktop the
 *     browser's own back button is right there, and a second one in
 *     the page would be noise.
 *   - Not on the role's own home page. Back from the place you start
 *     is either nothing or a sign-in screen; an inert button is worse
 *     than no button.
 *   - Only once there is somewhere to go. A freshly launched app has
 *     a single history entry, and the button appears the moment that
 *     stops being true.
 *
 * `home` is the role's landing page rather than a constant, because
 * "where you started" differs per role — /app/portal for a client,
 * /app/dashboard for the CEO, /app/my-dashboard for a videographer.
 * It is also the escape hatch: if history turns out to be empty when
 * the button is pressed, it goes there rather than doing nothing.
 */
export function BackButton({ home }: { home: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [canGoBack, setCanGoBack] = useState(false);

  // Read on the client only, and re-read on every navigation: history
  // grows as someone moves around, so a button that was correctly
  // hidden on launch has to appear on the first tap into a page.
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, [pathname]);

  if (pathname === home) return null;
  if (!canGoBack) return null;

  return (
    <button
      type="button"
      className="nav-back"
      onClick={() => {
        // history.length counts entries, not entries we can return
        // to, so it can be optimistic. Landing on the role's home is
        // a better failure than a button that does nothing.
        if (window.history.length > 1) router.back();
        else router.push(home);
      }}
      aria-label="Go back"
      title="Back"
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
