export interface BarDatum {
  label: string;
  value: number;
  /** Overrides the palette colour — use for status-carrying bars. */
  color?: string;
  href?: string;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

/**
 * A horizontal bar chart, built from divs rather than SVG.
 *
 * Horizontal because the labels are words ("Proposal", "Instagram
 * retainer") — vertical bars would force them to rotate or truncate.
 *
 * Every bar carries its label and value as text beside it, so the
 * chart is readable without relying on colour to tell the series
 * apart, and it degrades to a plain list if CSS fails to load.
 */
export function BarChart({
  data,
  formatValue = (n) => String(n),
  emptyMessage = "No data yet.",
  max: explicitMax,
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
  emptyMessage?: string;
  /** Force the scale — e.g. to compare two charts side by side. */
  max?: number;
}) {
  const rows = data.filter((d) => d.value > 0);

  if (rows.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: 0 }}>
        {emptyMessage}
      </p>
    );
  }

  const max = explicitMax ?? Math.max(...rows.map((d) => d.value));

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((d, i) => {
        const pct = max > 0 ? (d.value / max) * 100 : 0;
        return (
          <li key={d.label}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-1)", minWidth: 0 }}>
                {d.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text-2)",
                  flexShrink: 0,
                }}
              >
                {formatValue(d.value)}
              </span>
            </div>

            <div className="meter" style={{ height: 8 }}>
              <div
                className="meter-fill"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: d.color ?? PALETTE[i % PALETTE.length],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
