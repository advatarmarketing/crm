const STAGE_COLOR: Record<string, string> = {
  lead: "var(--status-warm)",
  proposal: "var(--status-warm)",
  active: "var(--status-active)",
};

export function StatusChip({ stage }: { stage: string }) {
  const color = STAGE_COLOR[stage] ?? "var(--text-3)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}`,
        borderRadius: 20,
        padding: "3px 10px",
      }}
    >
      {stage}
    </span>
  );
}
