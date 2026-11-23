"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { JourneyPath, TeamJourneyRow } from "@/lib/journey";

const ROLE_WORD: Record<string, string> = { operations_manager: "Operations manager", staff: "Staff", videographer: "Videographer" };

export function TeamJourneys({ rows: initial, paths }: { rows: TeamJourneyRow[]; paths: JourneyPath[] }) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  async function save(row: TeamJourneyRow, pathId: string | null, levelId: string | null) {
    setError(null);
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, pathId, levelId } : r)));
    const res = pathId
      ? await supabase.from("journey_members").upsert({ profile_id: row.id, path_id: pathId, level_id: levelId }, { onConflict: "profile_id" })
      : await supabase.from("journey_members").delete().eq("profile_id", row.id);
    if (res.error) {
      setRows(prev);
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) return <p className="access-muted">No one on the team yet.</p>;

  return (
    <div>
      {error && (
        <p className="cw-alert" role="alert">
          {error}
        </p>
      )}
      <div className="tj">
        {rows.map((r) => {
          const path = paths.find((p) => p.id === r.pathId) ?? null;
          const idx = path ? path.levels.findIndex((l) => l.id === r.levelId) : -1;
          const next = path && idx >= 0 ? path.levels[idx + 1] ?? null : null;
          return (
            <div key={r.id} className="card card-pad-sm tj-row">
              <div className="tj-person">
                <strong>{r.name}</strong>
                <span className="access-muted">{ROLE_WORD[r.role] ?? r.role}</span>
                {r.waiting > 0 && <span className="pill pill-warn">{r.waiting} to sign off</span>}
              </div>
              <label className="tj-field">
                <span>Path</span>
                <select
                  aria-label={`${r.name}: path`}
                  value={r.pathId ?? ""}
                  onChange={(e) => {
                    const p = paths.find((x) => x.id === e.target.value) ?? null;
                    save(r, p?.id ?? null, p?.levels[0]?.id ?? null);
                  }}
                >
                  <option value="">Not set up</option>
                  {paths.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tj-field">
                <span>Level</span>
                <select aria-label={`${r.name}: level`} value={r.levelId ?? ""} disabled={!path} onChange={(e) => save(r, r.pathId, e.target.value || null)}>
                  {!path && <option value="">Choose a path first</option>}
                  {path?.levels.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      {i + 1}. {l.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="tj-next">{path ? (next ? <>Next: {next.title}</> : "At the top of the path") : null}</div>
              {path && (
                <Link href={`/app/journey/${r.id}`} className="btn">
                  Open
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
