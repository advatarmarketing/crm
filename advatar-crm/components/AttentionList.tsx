import Link from "next/link";

export interface AttentionItem {
  id: string;
  href: string;
  label: string;
  detail: string;
  severity: "bad" | "warn";
}

/**
 * The "deal with this" list at the top of the dashboard.
 *
 * Capped at twelve rows. A list of forty things is the same as no list
 * — the point of this section is that it can be cleared, so it shows
 * the worst of it and says how much is left rather than becoming
 * something to scroll past every morning.
 *
 * Overdue rows carry a tinted background rather than just a coloured
 * left edge. This is the one place in the app where colour is used at
 * full strength, and it earns it: if something here is red, it has
 * genuinely been missed.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          color: "var(--ok-fg)",
          background: "var(--ok-bg)",
          border: "1px solid var(--ok-border)",
          borderRadius: "var(--radius-md)",
          padding: "16px 18px",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Nothing overdue. Everything is where it should be.
      </div>
    );
  }

  // Overdue money and dates first, then the softer warnings.
  const sorted = [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "bad" ? -1 : 1));
  const shown = sorted.slice(0, 12);
  const hidden = sorted.length - shown.length;

  return (
    <>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {shown.map((item) => {
          const bad = item.severity === "bad";
          const fg = bad ? "var(--danger-fg)" : "var(--warn-fg)";
          const bg = bad ? "var(--danger-bg)" : "var(--warn-bg)";
          const bd = bad ? "var(--danger-border)" : "var(--warn-border)";

          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="card-link"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  padding: "13px 16px",
                  border: `1px solid ${bd}`,
                  borderLeft: `3px solid ${fg}`,
                  borderRadius: "var(--radius-sm)",
                  background: bg,
                  minHeight: 52,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  {/* Two different marks, not two colours of the same
                      mark — severity survives greyscale this way. */}
                  <span aria-hidden="true" style={{ color: fg, flexShrink: 0, lineHeight: 0 }}>
                    {bad ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v6M12 16.5h.01" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l9 16H3z" />
                        <path d="M12 9v4M12 16h.01" />
                      </svg>
                    )}
                  </span>

                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      minWidth: 0,
                    }}
                  >
                    {item.label}
                  </span>
                </span>

                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color: fg,
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  {item.detail}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {hidden > 0 && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", margin: "12px 0 0" }}>
          + {hidden} more
        </p>
      )}
    </>
  );
}
