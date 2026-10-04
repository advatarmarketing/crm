"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A heading that opens what is under it.
 *
 * Closed to start with, because the things it holds are the ones you
 * want to be able to check rather than the ones you came to read — the
 * count in the heading is enough to tell you whether it is worth
 * opening at all.
 *
 * A button and aria-expanded rather than <details>, so the heading can
 * carry the count on its own line and the whole thing looks like the
 * rest of the dashboard's section heads.
 */
export function CollapsibleSection({
  title,
  count,
  countLabel,
  emptyLabel,
  children,
}: {
  title: string;
  /** Shown beside the title. Zero is still worth saying. */
  count: number;
  /** e.g. "not done" — rendered after the number. */
  countLabel: string;
  /** Shown instead of the count when there is nothing. */
  emptyLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const empty = count === 0;

  return (
    <div style={{ marginTop: 26 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        disabled={empty}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "11px 14px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "inherit",
          textAlign: "left",
          cursor: empty ? "default" : "pointer",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: "var(--text-3)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
            opacity: empty ? 0.35 : 1,
          }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>

        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            color: "var(--text-1)",
            flex: 1,
            minWidth: 0,
          }}
        >
          {title}
        </span>

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: empty ? "var(--text-3)" : "var(--text-2)",
            whiteSpace: "nowrap",
          }}
        >
          {empty ? emptyLabel : `${count} ${countLabel}`}
        </span>
      </button>

      {/* Mounted only when open. The panel below carries its own state,
          and keeping a closed copy of it alive would mean two lists
          quietly disagreeing about what has been ticked. */}
      {open && (
        <div id={id} style={{ marginTop: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}
