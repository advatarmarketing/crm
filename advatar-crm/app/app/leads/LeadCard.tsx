"use client";

import Link from "next/link";
import { advanceClientStage } from "./actions";
import { LogContactButton } from "./LogContactButton";
import { daysSince, formatDate, formatMoney, isPast } from "@/lib/format";
import type { ClientStage, LeadTemperature } from "@/lib/supabase/types";

export interface PipelineLead {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  service: string | null;
  stage: ClientStage;
  next_action: string | null;
  lead_source: string | null;
  lead_temperature: LeadTemperature | null;
  follow_up_date: string | null;
  estimated_value: number | null;
  likelihood: number | null;
  last_contacted_at: string | null;
}

const TEMPERATURE_COLOR: Record<string, string> = {
  hot: "var(--status-closed)",
  warm: "var(--status-warm)",
  cold: "var(--text-3)",
};

const NEXT_STAGE: Record<ClientStage, { stage: ClientStage; label: string } | null> = {
  lead: { stage: "proposal", label: "→ Proposal" },
  proposal: { stage: "active", label: "→ Won" },
  active: null,
};

export function LeadCard({ lead }: { lead: PipelineLead }) {
  const overdue = isPast(lead.follow_up_date);
  const sinceContact = daysSince(lead.last_contacted_at);
  const next = NEXT_STAGE[lead.stage];
  const tempColor = lead.lead_temperature ? TEMPERATURE_COLOR[lead.lead_temperature] : null;

  return (
    <li
      style={{
        padding: "13px 14px",
        border: `1px solid ${overdue ? "var(--status-closed)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <Link
          href={`/app/clients/${lead.id}`}
          style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 14.5, color: "var(--text-1)", textDecoration: "none", minWidth: 0 }}
        >
          {lead.name}
        </Link>
        {typeof lead.estimated_value === "number" && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-1)", flexShrink: 0 }}>
            {formatMoney(lead.estimated_value)}
            {typeof lead.likelihood === "number" && (
              <span style={{ color: "var(--text-3)" }}>{` · ${lead.likelihood}%`}</span>
            )}
          </span>
        )}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", marginBottom: 6 }}>
        {[lead.contact_name, lead.service, lead.lead_source ? `via ${lead.lead_source}` : null]
          .filter(Boolean)
          .join(" · ") || "No details yet"}
      </div>

      {lead.next_action && (
        <p style={{ margin: "0 0 8px", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.4 }}>
          {lead.next_action}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {tempColor && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: tempColor,
              border: `1px solid ${tempColor}`,
              borderRadius: 20,
              padding: "2px 8px",
            }}
          >
            {lead.lead_temperature}
          </span>
        )}

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: overdue ? "var(--status-closed)" : "var(--text-3)",
          }}
        >
          {lead.follow_up_date
            ? `${overdue ? "Overdue since" : "Follow up"} ${formatDate(lead.follow_up_date)}`
            : "No follow-up set"}
        </span>

        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
          {sinceContact === null
            ? "never contacted"
            : sinceContact === 0
              ? "contacted today"
              : `${sinceContact}d since contact`}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <LogContactButton clientId={lead.id} clientName={lead.name} />

        {next && (
          <form action={advanceClientStage}>
            <input type="hidden" name="clientId" value={lead.id} />
            <input type="hidden" name="nextStage" value={next.stage} />
            <button type="submit" className="btn" style={{ minHeight: 36, padding: "6px 10px", fontSize: 11 }}>
              {next.label}
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
