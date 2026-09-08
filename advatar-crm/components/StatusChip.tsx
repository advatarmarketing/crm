/**
 * A client's pipeline stage, as a tinted pill.
 *
 * Was an outlined chip in one of two colours, which made "lead" and
 * "proposal" look identical and left "active" competing for attention
 * with everything else on the card. Each stage now has its own tone,
 * and a dot alongside the word so the three are still distinguishable
 * without relying on the fill colour.
 */
const STAGE_CLASS: Record<string, string> = {
  lead: "pill pill-info",
  proposal: "pill pill-warn",
  active: "pill pill-ok",
  paused: "pill",
  closed: "pill pill-danger",
};

const STAGE_LABEL: Record<string, string> = {
  lead: "Lead",
  proposal: "Proposal",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};

export function StatusChip({ stage }: { stage: string }) {
  const key = stage?.toLowerCase?.() ?? "";
  return (
    <span className={STAGE_CLASS[key] ?? "pill"}>
      <span className="pill-dot" aria-hidden="true" />
      {STAGE_LABEL[key] ?? stage}
    </span>
  );
}
