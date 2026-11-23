"use client";

import { useState, useTransition } from "react";
import { ACCESS_AREAS, type AccessArea, type TeamAccess } from "@/lib/team-access";
import { setOwnContentAction, setReplierAccessAction, setStaffAccessAction, setVideographerShareAction } from "./actions";

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

export interface VideographerRow {
  id: string;
  name: string;
  clients: string[];
  canShare: boolean;
}

/**
 * Videographers have one switch: whether their uploads may go straight
 * to the client. Off, everything they hand in goes to the CEO and the
 * staff on that client first, who send it on once it is approved.
 */
export function VideographerTable({ rows: initial, available }: { rows: VideographerRow[]; available: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flip(row: VideographerRow) {
    const value = !row.canShare;
    setError(null);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, canShare: value } : r)));
    start(async () => {
      const res = await setVideographerShareAction(row.id, value);
      if (res.error) {
        setError(res.error);
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, canShare: row.canShare } : r)));
      }
    });
  }

  if (rows.length === 0) return <p className="access-muted">No videographer logins yet.</p>;

  return (
    <div>
      {!available && (
        <p className="access-note" role="status" style={{ marginBottom: 16 }}>
          This switch starts working once database update 0047 is run. Until then every videographer can still choose
          to send work to the client.
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
              <span className="access-muted">{r.clients.length === 0 ? "Not on any clients yet" : `On ${r.clients.join(", ")}`}</span>
            </div>
            <div className="access-switches">
              <label className="access-switch" title="Their uploads can go straight to the client, without the CEO or staff approving first">
                <input
                  type="checkbox"
                  checked={r.canShare}
                  disabled={!available}
                  onChange={() => flip(r)}
                  aria-label={`${r.name}: send videos to the client`}
                />
                <span>Send videos to the client</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface OwnContentRow {
  id: string;
  name: string;
  role: string;
  on: boolean;
}

const ROLE_WORD: Record<string, string> = { operations_manager: "Operations manager", staff: "Staff", videographer: "Videographer" };

/** 0053: who can see and work on YOU (your personal brand and the business). */
export function OwnContentTable({ rows: initial, available }: { rows: OwnContentRow[]; available: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flip(row: OwnContentRow) {
    const value = !row.on;
    setError(null);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, on: value } : r)));
    start(async () => {
      const res = await setOwnContentAction(row.id, value);
      if (res.error) {
        setError(res.error);
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, on: row.on } : r)));
      }
    });
  }

  if (rows.length === 0) return <p className="access-muted">Nobody else on the team yet.</p>;

  return (
    <div>
      {!available && (
        <p className="access-note" role="status" style={{ marginBottom: 16 }}>
          This switch starts working once database update 0053 is run.
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
              <span className="access-muted">{ROLE_WORD[r.role] ?? r.role}</span>
            </div>
            <div className="access-switches">
              <label className="access-switch" title="Sees YOU on their Clients page and works on your own content like any client">
                <input type="checkbox" checked={r.on} disabled={!available} onChange={() => flip(r)} aria-label={`${r.name}: your content`} />
                <span>Your content (YOU)</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 0056: who may use the Professional Replier (the CEO always can). */
export function ReplierAccessTable({ rows: initial, available }: { rows: OwnContentRow[]; available: boolean }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flip(row: OwnContentRow) {
    const value = !row.on;
    setError(null);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, on: value } : r)));
    start(async () => {
      const res = await setReplierAccessAction(row.id, value);
      if (res.error) {
        setError(res.error);
        setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, on: row.on } : r)));
      }
    });
  }

  if (rows.length === 0) return <p className="access-muted">Nobody else on the team yet.</p>;

  return (
    <div>
      {!available && (
        <p className="access-note" role="status" style={{ marginBottom: 16 }}>
          This switch starts working once database update 0056 is run.
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
              <span className="access-muted">{ROLE_WORD[r.role] ?? r.role}</span>
            </div>
            <div className="access-switches">
              <label className="access-switch" title="Sees the Professional Replier tab on Messages">
                <input type="checkbox" checked={r.on} disabled={!available} onChange={() => flip(r)} aria-label={`${r.name}: Professional Replier`} />
                <span>Professional Replier</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
