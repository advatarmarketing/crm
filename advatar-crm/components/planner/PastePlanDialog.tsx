"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parsePlannerPaste } from "@/lib/planner/parse-paste";
import type { PlannerContent } from "@/lib/planner/content";

/**
 * Paste a written-out plan, see what was understood, then fill.
 *
 * The middle step is the point. Filling replaces the whole document,
 * so the one thing this must never do is swallow a heading it did not
 * recognise and leave a section quietly empty — the summary says what
 * it found and what it ignored, and the button says how much is about
 * to be overwritten, before anything is touched.
 */
export function PastePlanDialog({
  onFill,
  onClose,
}: {
  onFill: (content: PlannerContent) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    areaRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Re-read on every keystroke so the summary tracks what is in the
  // box. The parser is pure string work over a page or two of text —
  // cheap enough that debouncing it would cost more than it saved.
  const parsed = useMemo(() => (text.trim() ? parsePlannerPaste(text) : null), [text]);

  const ready = Boolean(parsed && parsed.report.filled.length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Paste a content plan"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 3vw, 28px)",
      }}
    >
      <div
        style={{
          width: "min(840px, 100%)",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "14px 14px 12px 18px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 19,
                margin: "0 0 3px",
                color: "var(--text-1)",
              }}
            >
              Paste a content plan
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                color: "var(--text-3)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Paste the whole thing, headings and all. Nothing changes until you press Fill.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-1)",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={"=== HERO / SLATE ===\nScene: …\nTake: 01\n…"}
            style={{
              width: "100%",
              minHeight: 240,
              resize: "vertical",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-1)",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              lineHeight: 1.6,
            }}
          />

          {parsed && (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-2)",
              }}
            >
              {ready ? (
                <>
                  <Line label="Filling">{parsed.report.filled.join(" · ")}</Line>
                  {parsed.report.notes.length > 0 && (
                    <Line label="Found">{parsed.report.notes.join(" · ")}</Line>
                  )}
                  {parsed.report.ignored.length > 0 && (
                    <Line label="Skipped" warn>
                      {parsed.report.ignored.join(" · ")} — not a section this plan has
                    </Line>
                  )}
                </>
              ) : (
                <Line label="Nothing yet" warn>
                  {parsed.report.notes[0] ??
                    "No recognisable sections. Each one needs a heading like === OVERVIEW ==="}
                </Line>
              )}
            </div>
          )}

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12.5,
              color: "var(--text-3)",
              margin: "14px 0 0",
              lineHeight: 1.6,
            }}
          >
            Filling replaces everything currently in this plan. Anything the paste
            doesn&rsquo;t cover is left blank, with its prompt, rather than keeping
            the old answer — so what you end up with matches what you pasted.
          </p>
        </div>

        <footer
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            padding: "12px 18px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.5 }}
            onClick={() => {
              if (parsed && ready) onFill(parsed.content);
            }}
          >
            Fill the plan
          </button>
        </footer>
      </div>
    </div>
  );
}

function Line({
  label,
  children,
  warn = false,
}: {
  label: string;
  children: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 6, alignItems: "baseline" }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          flexShrink: 0,
          width: 58,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          lineHeight: 1.5,
          color: warn ? "var(--status-closed)" : "var(--text-1)",
        }}
      >
        {children}
      </span>
    </div>
  );
}
