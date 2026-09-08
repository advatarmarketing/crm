/**
 * A small trend line, for showing shape rather than values.
 *
 * Server-renderable inline SVG — no charting library, and nothing to
 * hydrate. It carries `aria-hidden` because the number it sits under
 * is the accessible version of the same information; a screen reader
 * reading out a path is noise.
 *
 * A flat series (every value equal) still draws a centred straight
 * line rather than dividing by a zero range.
 */
export function Sparkline({
  values,
  color = "var(--chart-2)",
  height = 28,
  width = 120,
  fill = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  /** A soft area under the line; turn off where space is tight. */
  fill?: boolean;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // 1px inset so a stroke at the very top or bottom isn't clipped.
  const pad = 1.5;
  const usable = height - pad * 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = pad + (1 - (v - min) / range) * usable;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", overflow: "visible" }}
    >
      {fill && <path d={area} fill={color} opacity={0.12} />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={2.5}
        fill={color}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
