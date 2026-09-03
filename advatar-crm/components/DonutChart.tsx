// Server-renderable — pure presentation, no interactivity, so this
// deliberately has no "use client". Reimplements the conic-gradient
// donut-with-legend pattern from the original single-file portal.

const PALETTE = [
  "#D4AF6A", // gold
  "#6B8AA6", // slate
  "#8FA37F", // sage
  "#C77B58", // coral
  "#9A6FA0", // plum
  "#9AA0A6", // gray
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
            border: `${thickness}px solid var(--surface-3)`,
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
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
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
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-3)",
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
          gap: 6,
        }}
      >
        {legend.map((d) => (
          <li
            key={d.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--text-2)",
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: d.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--text-1)" }}>{d.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
              {d.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { PALETTE as DONUT_PALETTE };
