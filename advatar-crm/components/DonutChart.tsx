// Server-renderable — pure presentation, no interactivity, so this
// deliberately has no "use client". Reimplements the conic-gradient
// donut-with-legend pattern from the original single-file portal.

// Theme-aware: these resolve differently in light and dark, so the
// wedges keep their separation on both grounds instead of the darker
// hues collapsing into the background.
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export interface DonutDatum {
  label: string;
  value: number;
  color?: string;
}

export function DonutChart({
  data,
  centerLabel,
  size = 160,
  thickness = 28,
}: {
  data: DonutDatum[];
  centerLabel?: string;
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total <= 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            border: `${thickness}px solid var(--chart-track)`,
          }}
        />
        <span style={{ fontSize: 13, color: "var(--text-3)", fontFamily: "var(--font-body)" }}>
          No data yet
        </span>
      </div>
    );
  }

  let cursor = 0;
  const stops: string[] = [];
  const legend = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const color = d.color ?? PALETTE[i % PALETTE.length];
      const start = (cursor / total) * 360;
      cursor += d.value;
      const end = (cursor / total) * 360;
      stops.push(`${color} ${start}deg ${end}deg`);
      return { ...d, color, pct: Math.round((d.value / total) * 100) };
    });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          borderRadius: "50%",
          background: `conic-gradient(${stops.join(", ")})`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: thickness,
            borderRadius: "50%",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            textAlign: "center",
            padding: 4,
          }}
        >
          {centerLabel && (
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 17,
                lineHeight: 1.15,
                letterSpacing: "0.01em",
                color: "var(--text-1)",
              }}
            >
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minWidth: 150,
        }}
      >
        {legend.map((d) => (
          <li
            key={d.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-2)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: d.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--text-1)", flex: 1, minWidth: 0 }}>{d.label}</span>
            {/* Both the share and the count: the percentage alone
                hides whether a slice is 2 of 4 or 200 of 400. */}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-3)", flexShrink: 0 }}>
              {d.value} · {d.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { PALETTE as DONUT_PALETTE };
