import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { advanceClientStage } from "./actions";

const TEMPERATURE_COLOR: Record<string, string> = {
  hot: "var(--status-closed)",
  warm: "var(--status-warm)",
  cold: "var(--text-3)",
};

function TemperatureChip({ temperature }: { temperature: string | null }) {
  if (!temperature) return null;
  const color = TEMPERATURE_COLOR[temperature] ?? "var(--text-3)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
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
      {temperature}
    </span>
  );
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

// Same `clients` table as /app/clients, filtered to stage='lead' and
// with the lead-tracking columns from 0010_ops_manager_leads_staff_
// scoping.sql surfaced (source, temperature, follow-up date). RLS
// scopes this exactly the same way it scopes /app/clients: a plain
// `staff` account only ever sees leads it's already assigned to via
// client_staff — a brand-new, unassigned lead is management-only
// (ceo/operations_manager) territory until someone's put on it.
export default async function LeadsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: callerProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const canAdd = callerProfile?.role === "ceo" || callerProfile?.role === "operations_manager";

  const { data: leads } = await supabase
    .from("clients")
    .select("id, name, contact_name, contact_email, service, next_action, lead_source, lead_temperature, follow_up_date")
    .eq("stage", "lead")
    .order("follow_up_date", { ascending: true, nullsFirst: false });

  return (
    <main style={{ padding: "40px 32px", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: 0 }}>Leads</h1>
        {canAdd && (
          <Link
            href="/app/clients/new?stage=lead"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              textDecoration: "none",
              padding: "10px 16px",
              borderRadius: "var(--radius-sm)",
              background: "var(--text-1)",
              color: "var(--bg)",
            }}
          >
            + Add lead
          </Link>
        )}
      </div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 28px" }}>
        Clients not yet won — track who needs progressing and when to follow up.
      </p>

      {!leads || leads.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>No leads to show.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {leads.map((lead) => {
            const overdue = isOverdue(lead.follow_up_date);
            return (
              <li
                key={lead.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "16px 18px",
                  border: `1px solid ${overdue ? "var(--status-closed)" : "var(--border)"}`,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--text-1)" }}>
                      {lead.name}
                    </span>
                    <TemperatureChip temperature={lead.lead_temperature} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginBottom: 6 }}>
                    {[lead.contact_name, lead.contact_email, lead.service].filter(Boolean).join(" · ") || "No contact details yet"}
                  </div>
                  {lead.next_action && (
                    <p style={{ margin: "0 0 6px", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)" }}>
                      {lead.next_action}
                    </p>
                  )}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: overdue ? "var(--status-closed)" : "var(--text-3)" }}>
                    {lead.lead_source ? `Source: ${lead.lead_source}` : "Source not set"}
                    {lead.follow_up_date &&
                      ` · Follow up ${overdue ? "was due" : "due"} ${new Date(lead.follow_up_date).toLocaleDateString()}`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link
                    href={`/app/clients/${lead.id}`}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      textDecoration: "none",
                      color: "var(--text-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px 12px",
                    }}
                  >
                    Open
                  </Link>
                  <form action={advanceClientStage}>
                    <input type="hidden" name="clientId" value={lead.id} />
                    <input type="hidden" name="nextStage" value="proposal" />
                    <button
                      type="submit"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        padding: "8px 12px",
                        background: "var(--text-1)",
                        color: "var(--bg)",
                        cursor: "pointer",
                      }}
                    >
                      Move to proposal
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
