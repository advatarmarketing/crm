"use client";

import { useMemo, useState } from "react";
import { LeadCard, type PipelineLead } from "./LeadCard";
import { isPast } from "@/lib/format";

const COLUMNS = [
  { stage: "lead" as const, title: "Leads", blurb: "Not yet pitched" },
  { stage: "proposal" as const, title: "Proposal", blurb: "Pitched, deciding" },
  { stage: "active" as const, title: "Recently won", blurb: "Last 30 days" },
];

/**
 * The three pipeline columns, with search and filtering over them.
 *
 * Filtering runs over rows the server already fetched under RLS, so a
 * staff member can only ever search within clients they're assigned
 * to — a search box here can't reach anything a query wouldn't have
 * returned anyway.
 */
export function PipelineBoard({
  leads,
  sources,
}: {
  leads: (PipelineLead & { updated_at: string })[];
  sources: string[];
}) {
  const [query, setQuery] = useState("");
  const [temperature, setTemperature] = useState("all");
  const [source, setSource] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return leads.filter((c) => {
      if (temperature !== "all" && (c.lead_temperature ?? "") !== temperature) return false;
      if (source !== "all" && (c.lead_source ?? "") !== source) return false;
      // "Won" cards can't be overdue — they have nothing left to chase
      // — so the overdue filter hides that column rather than
      // pointlessly emptying it.
      if (overdueOnly && !isPast(c.follow_up_date)) return false;
      if (!q) return true;
      return [c.name, c.contact_name, c.contact_email, c.service, c.next_action, c.lead_source]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [leads, query, temperature, source, overdueOnly]);

  const byStage = {
    lead: filtered.filter((c) => c.stage === "lead"),
    proposal: filtered.filter((c) => c.stage === "proposal"),
    active: filtered
      .filter((c) => c.stage === "active" && new Date(c.updated_at) >= thirtyDaysAgo)
      .slice(0, 10),
  };

  const anyFilter = query.trim() !== "" || temperature !== "all" || source !== "all" || overdueOnly;

  return (
    <>
      <div className="filter-bar">
        <input
          className="filter-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, contact, service or source…"
          aria-label="Search pipeline"
        />

        <select
          className="filter-select"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          aria-label="Filter by temperature"
        >
          <option value="all">Any temperature</option>
          <option value="hot">Hot</option>
          <option value="warm">Warm</option>
          <option value="cold">Cold</option>
        </select>

        {sources.length > 0 && (
          <select
            className="filter-select"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="all">Any source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          className={overdueOnly ? "btn btn-primary" : "btn"}
          onClick={() => setOverdueOnly((v) => !v)}
          aria-pressed={overdueOnly}
        >
          Overdue only
        </button>
      </div>

      <div className="pipeline">
        {COLUMNS.map((col) => {
          const items = byStage[col.stage];
          return (
            <section key={col.stage} style={{ minWidth: 0 }}>
              <div style={{ marginBottom: 12 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0, letterSpacing: "0.02em" }}>
                  {col.title}
                  <span style={{ color: "var(--text-3)", marginLeft: 8 }}>{items.length}</span>
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-3)",
                    margin: "2px 0 0",
                  }}
                >
                  {col.blurb}
                </p>
              </div>

              {items.length === 0 ? (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
                  {anyFilter ? "Nothing matches here." : "Nothing here."}
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
