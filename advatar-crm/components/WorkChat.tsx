"use client";

import { useState, type ReactNode } from "react";

export interface WorkChatSection {
  key: string;
  label: string;
  /** Who can read what's said here. Always shown, never a tooltip. */
  audience: string;
  /** Green when the client can see it, plain when they can't. */
  clientVisible: boolean;
  badge?: number;
  content: ReactNode;
}

/**
 * The videographer's Work Chat: everything to do with the job, in one
 * place, with a switch between the conversations it contains.
 *
 * The reason this is one tab with a switch rather than three tabs is
 * the thing that actually matters here — whether the client is in the
 * room. Sitting the two client conversations next to each other, each
 * labelled, makes that a choice you make rather than one you assume.
 *
 * Every pane stays mounted so switching doesn't discard a draft.
 */
export function WorkChat({ sections }: { sections: WorkChatSection[] }) {
  const [active, setActive] = useState(sections[0]?.key ?? "");
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {sections.map((section) => {
          const on = section.key === active;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setActive(section.key)}
              aria-pressed={on}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "8px 13px",
                borderRadius: "var(--radius-pill)",
                border: `1px solid ${on ? "var(--text-1)" : "var(--border)"}`,
                background: on ? "var(--text-1)" : "var(--surface)",
                color: on ? "var(--bg)" : "var(--text-2)",
                cursor: "pointer",
              }}
            >
              {section.label}
              {(section.badge ?? 0) > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    color: on ? "var(--text-1)" : "var(--bg)",
                    background: on ? "var(--bg)" : "var(--text-1)",
                    borderRadius: 20,
                    padding: "1px 6px",
                  }}
                >
                  {section.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {current && (
        <p
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: current.clientVisible ? "var(--warn-fg)" : "var(--text-2)",
            background: current.clientVisible ? "var(--warn-bg)" : "var(--surface-2)",
            border: `1px solid ${current.clientVisible ? "var(--warn-border)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "9px 12px",
            margin: "0 0 18px",
          }}
        >
          {/* An eye for "they can see this", a crossed-out eye for
              "they can't" — so the distinction isn't carried by the
              colour alone. */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            {current.clientVisible ? (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ) : (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <path d="M1 1l22 22" />
              </>
            )}
          </svg>
          {current.audience}
        </p>
      )}

      {sections.map((section) => (
        <div key={section.key} hidden={section.key !== active}>
          {section.content}
        </div>
      ))}
    </div>
  );
}
