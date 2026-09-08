import { Sparkline } from "./Sparkline";

export type StatTone = "neutral" | "ok" | "warn" | "danger" | "accent";

const TONE_FG: Record<StatTone, string> = {
  neutral: "var(--text-1)",
  ok: "var(--ok-fg)",
  warn: "var(--warn-fg)",
  danger: "var(--danger-fg)",
  accent: "var(--accent)",
};

const TONE_RULE: Record<StatTone, string> = {
  neutral: "var(--border-2)",
  ok: "var(--ok-fg)",
  warn: "var(--warn-fg)",
  danger: "var(--danger-fg)",
  accent: "var(--accent)",
};

/**
 * A single figure, with the room to be read at a glance.
 *
 * `tone` is the whole point of this component: a tile is quiet by
 * default and only takes colour when the number actually means
 * something is wrong or notable. Colouring every tile the same amount
 * is the same as colouring none of them.
 *
 * The tone shows as a short rule above the figure AND changes the
 * figure's colour, so the state never rests on hue alone — which
 * matters for anyone who can't separate the reds from the greens.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  delta,
  spark,
}: {
  label: string;
  value: string;
  /** Optional line under the figure — e.g. a comparison with last month. */
  hint?: string;
  /** Raise the tile's prominence when the number needs attention. */
  tone?: StatTone;
  /** Signed percentage change; renders with an arrow and its own colour. */
  delta?: number | null;
  /** A short series to draw as a trend line behind the hint. */
  spark?: number[];
}) {
  const showDelta = typeof delta === "number" && Number.isFinite(delta);
  const deltaUp = showDelta && delta >= 0;

  return (
    <div
      className="card card-pad"
      style={{
        flex: "1 1 180px",
        minWidth: 170,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "block",
          width: tone === "neutral" ? 20 : 28,
          height: 3,
          borderRadius: "var(--radius-pill)",
          background: TONE_RULE[tone],
          opacity: tone === "neutral" ? 0.5 : 1,
          marginBottom: 2,
        }}
      />

      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-3)",
        }}
      >
        {label}
      </span>

      <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 34,
            lineHeight: 1,
            letterSpacing: "0.01em",
            color: TONE_FG[tone],
          }}
        >
          {value}
        </span>

        {showDelta && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: deltaUp ? "var(--ok-fg)" : "var(--danger-fg)",
              whiteSpace: "nowrap",
            }}
          >
            {deltaUp ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </span>

      {spark && spark.length > 1 && (
        <Sparkline
          values={spark}
          color={tone === "neutral" ? "var(--chart-2)" : TONE_FG[tone]}
          height={26}
        />
      )}

      {hint && (
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--text-3)",
            lineHeight: 1.45,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
