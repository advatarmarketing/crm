"use client";

import { useEffect, useRef } from "react";

/**
 * The preview window.
 *
 * A panel over the CEO's own CRM rather than a new tab, so closing it
 * puts them back exactly where they were. What's inside is the real
 * app on the same origin, rendered as the other person by the server —
 * not a mock-up of it, so what they see is genuinely what that person
 * sees, including an empty screen where they have nothing.
 *
 * Read-only is enforced in middleware, not here. Nothing in this file
 * is load-bearing for that: hiding buttons would only be cosmetic, and
 * the refusal has to sit somewhere the browser cannot argue with.
 */
export function ViewAsWindow({
  name,
  roleLabel,
  href,
  onClose,
}: {
  name: string;
  roleLabel: string;
  href: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Escape closes it, because a panel that traps you is worse than
    // no panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Stop the page behind from scrolling while this is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing the CRM as ${name}`}
      onMouseDown={(e) => {
        // Only a click on the backdrop itself, so a drag that ends out
        // here after selecting text inside doesn't close the window.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 3vw, 32px)",
      }}
    >
      <div
        style={{
          width: "min(1180px, 100%)",
          height: "min(860px, 100%)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px 10px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Viewing as — read only
            </span>
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-1)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {name} · {roleLabel}
            </span>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the preview and go back to your CRM"
            style={{
              flexShrink: 0,
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-1)",
              fontSize: 17,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </header>

        <iframe
          src={href}
          title={`The CRM as ${name} sees it`}
          style={{ flex: 1, width: "100%", border: "none", background: "var(--bg)" }}
        />
      </div>
    </div>
  );
}
