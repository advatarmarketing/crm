"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Eases panels in as they are scrolled to.
 *
 * Only panels that start below the bottom of the screen are touched:
 * whatever is visible when a page opens is left alone (the page's own
 * arrival animation covers it), so nothing a person is looking at ever
 * blinks out and back. The hidden state is a data attribute this
 * component sets, never a class in the markup, so without scripts, or
 * if this fails, every panel is simply visible.
 */
const SELECTOR = ".card, .section, main section, [data-reveal-on]";

export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let pending: HTMLElement[] = [];
    let frame = 0;

    function reveal(el: HTMLElement) {
      el.setAttribute("data-reveal", "in");
      // Cleared afterwards so a revealed panel carries no leftover
      // transition into its own hover and drag behaviour.
      window.setTimeout(() => el.removeAttribute("data-reveal"), 450);
    }

    // Anything whose top edge has come up past the bottom of the
    // screen is shown, including panels a fast scroll or a jump to the
    // end went straight past: nothing can be left hidden above you.
    function check() {
      frame = 0;
      const line = window.innerHeight * 0.96;
      pending = pending.filter((el) => {
        if (!el.isConnected) return false;
        if (el.getBoundingClientRect().top > line) return true;
        reveal(el);
        return false;
      });
      if (pending.length === 0) window.removeEventListener("scroll", onScroll, true);
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(check);
    }

    // After the page's own arrival animation has started.
    const start = window.setTimeout(() => {
      const fold = window.innerHeight;
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        // A panel inside a hidden panel would wait for a parent that
        // is itself waiting; and anything floating must never hide.
        if (el.closest('[data-reveal="pending"], [role="dialog"], [role="menu"], .planner-doc, .report')) return;
        if (el.getBoundingClientRect().top < fold) return;
        el.setAttribute("data-reveal", "pending");
        pending.push(el);
      });
      // Capturing, so scrolling inside a panel counts as well.
      if (pending.length) window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    }, 60);

    return () => {
      window.clearTimeout(start);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll, true);
      pending.forEach((el) => el.removeAttribute("data-reveal"));
      pending = [];
    };
  }, [pathname]);

  return null;
}
