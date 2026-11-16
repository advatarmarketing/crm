"use client";

import { useState, useTransition } from "react";
import { ACCESS_AREAS, type AccessArea, type TeamAccess } from "@/lib/team-access";
import { setStaffAccessAction } from "./actions";

export interface StaffAccessRow {
  id: string;
  name: string;
  clients: string[];
  access: TeamAccess;
}

export function AccessTable({ rows: initial, available }: { rows: StaffAccessRow[]; available: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flip(row: StaffAccessRow, area: AccessArea) {
    const value = !row.access[area];
    setError(null);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, access: { ...r.access, [area]: value } } : r)));
    start(async () => {
      const res = await setStaffAccessAction(row.id, row.access, area, value);
      if (res.error) {
        setError(res.error);
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, access: row.access } : r)));
      }
    });
  }

  if (rows.length === 0) {
    return <p className="access-muted">No staff logins yet. Create one on the Logins page.</p>;
  }

  return (
    <div>
      {!available && (
        <p className="access-note" role="status" style={{ marginBottom: 16 }}>
          These switches start working once database update 0044 is run. Until then every staff member
          keeps what they have now: contracts and logins on, money off.
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}
      <div className="access-table" aria-busy={pending}>
        {rows.map((r) => (
          <div key={r.id} className="access-row" data-person={r.name}>
            <div className="access-person">
              <strong>{r.name}</strong>
              <span className="access-muted">
                {r.clients.length === 0 ? "Not on any clients yet" : `On ${r.clients.join(", ")}`}
              </span>
            </div>
            <div className="access-switches">
              {ACCESS_AREAS.map((a) => (
                <label key={a.key} className="access-switch" title={a.detail}>
                  <input
                    type="checkbox"
                    checked={r.access[a.key]}
                    disabled={!available}
                    onChange={() => flip(r, a.key)}
                    aria-label={`${r.name}: ${a.label}`}
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
