"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientCard } from "./ClientCard";

export interface BrowsableClient {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  service: string | null;
  stage: string;
  next_action: string | null;
  avatar_url: string | null;
  created_at: string;
  monthlyValue?: number | null;
}

type SortKey = "recent" | "name" | "stage";

const SORT_STORAGE_KEY = "advatar-clients-sort";

/**
 * Search, filtering and sorting for the Clients list.
 *
 * Filtering happens in the browser over rows the server already
 * fetched, which matters for more than speed: those rows arrived
 * through RLS, so a staff member searching can only ever match
 * clients they're assigned to. There is no way for a search box to
 * widen what someone can see, because it never issues a query.
 *
 * That does mean the whole (already-scoped) list is sent to the page.
 * Fine at an agency's scale — a few hundred clients at most. If this
 * ever reaches thousands, this component is the thing to swap for a
 * server-side query, not the permission model.
 */
export function ClientsBrowser({
  clients,
  services,
}: {
  clients: BrowsableClient[];
  services: string[];
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [service, setService] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");

  // Sort choice is remembered per browser. Wrapped because storage
  // throws outright in some privacy modes, and a remembered sort
  // order is not worth breaking the page over.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (saved === "recent" || saved === "name" || saved === "stage") setSort(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function changeSort(next: SortKey) {
    setSort(next);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = clients.filter((c) => {
      if (stage !== "all" && c.stage !== stage) return false;
      if (service !== "all" && (c.service ?? "") !== service) return false;
      if (!q) return true;
      return [c.name, c.contact_name, c.contact_email, c.service, c.next_action]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });

    const stageOrder: Record<string, number> = { active: 0, proposal: 1, lead: 2 };

    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stage") {
        const diff = (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [clients, query, stage, service, sort]);

  return (
    <>
      <div className="filter-bar">
        <input
          className="filter-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, contact, email or service…"
          aria-label="Search clients"
        />

        <select className="filter-select" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter by stage">
          <option value="all">All stages</option>
          <option value="lead">Lead</option>
          <option value="proposal">Proposal</option>
          <option value="active">Active</option>
        </select>

        {services.length > 0 && (
          <select className="filter-select" value={service} onChange={(e) => setService(e.target.value)} aria-label="Filter by service">
            <option value="all">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <select
          className="filter-select"
          value={sort}
          onChange={(e) => changeSort(e.target.value as SortKey)}
          aria-label="Sort clients"
        >
          <option value="recent">Newest first</option>
          <option value="name">A–Z</option>
          <option value="stage">By stage</option>
        </select>

        <span className="filter-count">
          {visible.length === clients.length
            ? `${clients.length} client${clients.length === 1 ? "" : "s"}`
            : `${visible.length} of ${clients.length}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          {clients.length === 0 ? "No clients to show." : "Nothing matches those filters."}
        </p>
      ) : (
        <div className="card-grid">
          {visible.map((c) => (
            <ClientCard
              key={c.id}
              id={c.id}
              name={c.name}
              service={c.service}
              stage={c.stage}
              nextAction={c.next_action}
              avatarUrl={c.avatar_url}
              monthlyValue={c.monthlyValue}
            />
          ))}
        </div>
      )}
    </>
  );
}
