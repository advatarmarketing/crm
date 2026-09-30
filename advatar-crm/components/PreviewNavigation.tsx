"use client";

import { useEffect } from "react";

/**
 * Keeps the preview a preview while somebody clicks around in it.
 *
 * A request is only rendered as the other person when it carries
 * `?_viewAs=1`, so every link inside the preview window has to keep
 * carrying it. Rather than thread a flag through every Link in the
 * app, this catches clicks on the way down and rewrites them.
 *
 * Deliberately a full page load rather than Next's client-side router:
 * the marker has to be on the request the server sees, and a full load
 * is the one way to be sure of that. It costs a flicker inside the
 * window, which is a fair price for the CEO's own session never being
 * one missing query parameter away from being mistaken for somebody
 * else's.
 *
 * Fails safe either way. If this misses a link, that request arrives
 * without the marker and the viewer sees their own CRM — mildly
 * confusing, never a leak.
 */
export function PreviewNavigation() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Let modified clicks alone: ctrl/cmd-click, middle-click and
      // shift-click all mean "open this somewhere else", and the
      // somewhere else would not be this window.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      // Only our own pages. An outside link stays exactly as written —
      // appending an internal marker to somebody else's URL would be
      // both pointless and rude.
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith("/app")) return;

      url.searchParams.set("_viewAs", "1");
      event.preventDefault();
      window.location.assign(url.toString());
    }

    // Capture phase, so this runs before React's own handlers and
    // before the router has a chance to take the navigation.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
