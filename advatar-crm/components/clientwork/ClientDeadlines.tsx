import { MeterCard } from "./ClientWorkDashboard";
import type { ClientMeterRow } from "@/lib/client-work";

/**
 * Every client you're on, and how far ahead their videos are: worst
 * first. Each opens that client's dashboard. Nothing shows until a
 * client has videos scheduled.
 */
export function ClientDeadlines({ meters, base }: { meters: ClientMeterRow[]; base: string }) {
  if (meters.length === 0) return null;
  const attention = meters.filter((m) => m.meter.health === "late" || m.meter.health === "behind").length;
  return (
    <section className="section" aria-labelledby="cd-h">
      <div className="section-head">
        <h2 id="cd-h" className="section-title">
          Client deadlines
        </h2>
        <span className="cw-sub" style={{ margin: 0 }}>
          {attention ? `${attention} need${attention === 1 ? "s" : ""} attention` : "Goal: every client 2 weeks ahead"}
        </span>
      </div>
      <div className="cd-grid">
        {meters.map((m) => (
          <MeterCard key={m.clientId} meter={m.meter} compact name={m.internal ? `YOU · ${m.name}` : m.name} href={`${base}/${m.clientId}`} />
        ))}
      </div>
    </section>
  );
}
