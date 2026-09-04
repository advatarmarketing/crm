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
        <h1 className="page-title">Pipeline</h1>
        {canAdd && (
          <Link href="/app/clients/new?stage=lead" className="btn btn-primary">
            + Add lead
          </Link>
        )}
      </div>

      <div className="stat-row">
        <StatTile label="Weighted pipeline" value={formatMoney(weighted)} />
        <StatTile label="Total in play" value={formatMoney(totalValue)} />
        <StatTile label="Overdue follow-ups" value={String(overdueCount)} />
        {conversion !== null && <StatTile label="Won rate" value={`${conversion}%`} />}
      </div>

      {overdueCount > 0 && (
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13.5,
            color: "var(--status-closed)",
            border: "1px solid var(--status-closed)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            margin: "0 0 24px",
          }}
        >
          {overdueCount === 1
            ? "1 lead is past its follow-up date."
            : `${overdueCount} leads are past their follow-up date.`}{" "}
          They&apos;re outlined in red below.
        </p>
      )}

      <PipelineBoard leads={all} sources={sources} />

    </main>
  );
}
