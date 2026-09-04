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
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          color: "var(--status-active)",
          border: "1px solid var(--status-active)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          margin: 0,
        }}
      >
        Nothing overdue. Everything is where it should be.
      </p>
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
          const color = item.severity === "bad" ? "var(--status-closed)" : "var(--status-warm)";
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "11px 14px",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${color}`,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                  textDecoration: "none",
                  minHeight: 48,
                }}
              >
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
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10.5,
                    color,
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
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", margin: "10px 0 0" }}>
          + {hidden} more
        </p>
      )}
    </>
  );
}
