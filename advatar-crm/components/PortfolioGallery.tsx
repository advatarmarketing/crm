"use client";

import { useState } from "react";

export interface PortfolioItem {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  url: string | null;
  version: number;
  completedAt: string;
  revisions: number;
}

type GroupBy = "client" | "date";

/**
 * Completed work, grouped either by client or by month.
 *
 * Grouped by client by default. A videographer's portfolio is
 * normally being read for "what have you done for people like me",
 * and a client's name is what makes that legible — a flat date list
 * answers "when" instead, which is the less useful question most of
 * the time. Sorting by date is one click away.
 */
export function PortfolioGallery({ items }: { items: PortfolioItem[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("client");
  const [filter, setFilter] = useState("");

  if (items.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-3)" }}>
        Nothing here yet. Once a video you&rsquo;ve submitted is approved, it
        lands here automatically.
      </p>
    );
  }

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          (i.clientName ?? "").toLowerCase().includes(needle)
      )
    : items;

  const groups = groupBy === "client" ? groupByClient(shown) : groupByMonth(shown);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Toggle active={groupBy === "client"} onClick={() => setGroupBy("client")} label="By client" />
          <Toggle active={groupBy === "date"} onClick={() => setGroupBy("date")} label="By date" />
        </div>

        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search titles and clients…"
          style={{
            flex: "1 1 200px",
            maxWidth: 320,
            padding: "9px 11px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-1)",
            fontFamily: "var(--font-body)",
            fontSize: 13.5,
          }}
        />
      </div>

      {shown.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
          Nothing matches &ldquo;{filter}&rdquo;.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {groups.map((group) => (
            <section key={group.label}>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 19,
                  margin: "0 0 2px",
                  color: "var(--text-1)",
                }}
              >
                {group.label}
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  margin: "0 0 12px",
                }}
              >
                {group.items.length} video{group.items.length === 1 ? "" : "s"}
              </p>

              <div className="card-grid">
                {group.items.map((item) => (
                  <article
                    key={item.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--surface)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 600, color: "var(--text-1)" }}>
                      {item.title}
                    </span>

                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.6 }}>
                      {groupBy === "client"
                        ? new Date(item.completedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : item.clientName ?? "No client"}
                      <br />
                      {item.revisions} version{item.revisions === 1 ? "" : "s"}
                    </span>

                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{ textDecoration: "none", alignSelf: "flex-start", marginTop: "auto" }}
                      >
                        Watch ↗
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "7px 12px",
        borderRadius: 20,
        border: "1px solid var(--border)",
        background: active ? "var(--text-1)" : "var(--surface)",
        color: active ? "var(--bg)" : "var(--text-2)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function groupByClient(items: PortfolioItem[]) {
  const map = new Map<string, PortfolioItem[]>();
  for (const item of items) {
    const key = item.clientName ?? "No client";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }

  return Array.from(map.entries())
    .map(([label, group]) => ({
      label,
      items: group.sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    }))
    // Most-worked-with client first; it's the most representative
    // thing to lead with.
    .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
}

function groupByMonth(items: PortfolioItem[]) {
  const map = new Map<string, { label: string; items: PortfolioItem[] }>();

  for (const item of items) {
    const d = new Date(item.completedAt);
    // Sortable key, readable label.
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, {
        label: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, group]) => ({
      label: group.label,
      items: group.items.sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    }));
}
