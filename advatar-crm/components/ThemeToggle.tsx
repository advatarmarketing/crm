"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "advatar-theme";

/**
 * Light/dark switch.
 *
 * Light is the product default: with no stored choice and no OS
 * preference for dark, the app renders light. The actual palette
 * swap is pure CSS (see globals.css) -- all this does is stamp
 * `data-theme` on <html> and remember the choice, so the CSS's three
 * states resolve correctly.
 *
 * The initial stamp happens in an inline script in app/layout.tsx,
 * before the browser paints, so a dark-mode user never sees a white
 * flash. That means this component must NOT assume it knows the theme
 * on first render -- it reads whatever that script already decided,
 * after mount, which is also why the label is blank until `mounted`
 * (rendering "Dark" on the server and "Light" on the client would be
 * a hydration mismatch).
 */
export function ThemeToggle({ size = 36 }: { size?: number }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const explicit = root.getAttribute("data-theme");
    if (explicit) {
      setIsDark(explicit === "dark");
    } else {
      setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    setMounted(true);
  }, []);

  function toggle() {
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / blocked storage: the theme still applies
      // for this page view, it just won't be remembered next time.
    }
    setIsDark(!isDark);
  }

  const iconPx = Math.max(11, Math.round(size * 0.42));

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-2)",
        cursor: "pointer",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {/* The glyph keeps its proportion when the button is made smaller,
          so a 28px toggle beside a wordmark doesn't end up with a
          full-size moon rattling around inside it. */}
      {mounted && (isDark ? <SunIcon px={iconPx} /> : <MoonIcon px={iconPx} />)}
    </button>
  );
}

function MoonIcon({ px = 15 }: { px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon({ px = 15 }: { px?: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
