import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/StatTile";
import type { PipelineLead } from "./LeadCard";
import { PipelineBoard } from "./PipelineBoard";
import { formatMoney, isPast } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The sales pipeline — the same `clients` table as /app/clients, read
 * as a funnel rather than a directory.
 *
 * RLS scopes this exactly as it scopes /app/clients: a plain `staff`
 * account only sees clients it is assigned to, so a brand-new
 * unassigned lead is management-only territory until someone is put on
 * it (0010_ops_manager_leads_staff_scoping.sql).
 *
 * The "Recently won" column is capped to the last 30 days on purpose.
 * The other two columns are work in progress and need to be complete;
 * won business belongs on the Clients page, and an uncapped column
 * would grow forever and push the columns that need attention off the
 * screen.
 */
export default async function LeadsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: callerProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const canAdd = callerProfile?.role === "ceo" || callerProfile?.role === "operations_manager";

  const { data } = await supabase
    .from("clients")
    .select(
      "id, name, contact_name, contact_email, service, stage, next_action, lead_source, lead_temperature, follow_up_date, estimated_value, likelihood, last_contacted_at, updated_at"
    )
    .order("follow_up_date", { ascending: true, nullsFirst: false });

  const all = (data ?? []) as unknown as (PipelineLead & { updated_at: string })[];

  // Headline figures deliberately reflect the WHOLE pipeline, not
  // whatever is currently filtered on screen — "weighted pipeline"
  // has to mean the same number every time it's read, or it isn't a
  // number you can plan against.
  const openPipeline = all.filter((c) => c.stage === "lead" || c.stage === "proposal");

  const sources = Array.from(
    new Set(all.map((c) => c.lead_source).filter((s): s is string => !!s))
  ).sort();

  // Weighted = value x likelihood. Anything without a likelihood is
  // counted at 50% rather than dropped: a lead with a value and no
  // percentage is still real money, and excluding it would quietly
  // understate the forecast.
  const weighted = openPipeline.reduce(
    (sum, c) => sum + (c.estimated_value ?? 0) * ((c.likelihood ?? 50) / 100),
    0
  );

  const totalValue = openPipeline.reduce((sum, c) => sum + (c.estimated_value ?? 0), 0);
  const overdueCount = openPipeline.filter((c) => isPast(c.follow_up_date)).length;

  // Of everything that has reached a conclusion, how much was won.
  // Only meaningful once there is something to divide by.
  const won = all.filter((c) => c.stage === "active").length;
  const conversionBase = won + openPipeline.length;
  const conversion = conversionBase > 0 ? Math.round((won / conversionBase) * 100) : null;

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title page-title-accent">Pipeline</h1>
        {canAdd && (
          <Link href="/app/clients/new?stage=lead" className="btn btn-accent">
            + Add lead
          </Link>
        )}
      </div>

      <div className="stat-row">
        <StatTile
          label="Weighted pipeline"
          value={formatMoney(weighted)}
          tone="accent"
          hint="value × likelihood"
        />
        <StatTile label="Total in play" value={formatMoney(totalValue)} hint="if everything landed" />
        <StatTile
          label="Overdue follow-ups"
          value={String(overdueCount)}
          tone={overdueCount > 0 ? "danger" : "ok"}
          hint={overdueCount > 0 ? "chase these first" : "all up to date"}
        />
        {conversion !== null && <StatTile label="Won rate" value={`${conversion}%`} hint="won vs still open" />}
      </div>

      {overdueCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            fontFamily: "var(--font-body)",
            fontSize: 13.5,
            color: "var(--danger-fg)",
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-md)",
            padding: "14px 16px",
            margin: "0 0 28px",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v6M12 16.5h.01" />
          </svg>
          <span>
            {overdueCount === 1
              ? "1 lead is past its follow-up date."
              : `${overdueCount} leads are past their follow-up date.`}{" "}
            They&apos;re highlighted below.
          </span>
        </div>
      )}

      <PipelineBoard leads={all} sources={sources} />

    </main>
  );
}
