export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  /** Optional line under the figure — e.g. a comparison with last month. */
  hint?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "18px 20px",
        flex: "1 1 160px",
        minWidth: 160,
      }}
    >
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-3)",
          marginBottom: 8,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-display)",
          fontSize: 32,
          letterSpacing: "0.01em",
          color: "var(--text-1)",
        }}
      >
        {value}
      </span>
      {hint && (
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--text-3)",
            marginTop: 4,
          }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}
