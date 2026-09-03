"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AssignedTeamMember {
  staffId: string;
  fullName: string | null;
  role: string;
  roleOnClient: string | null;
}

export interface AssignableProfile {
  id: string;
  fullName: string | null;
  role: string;
}

/**
 * ceo/staff only — but this isn't enforced by a role check in this
 * component. It's enforced structurally: `app/app/clients/[id]/page.tsx`
 * is only reachable by ceo/staff at all (middleware.ts routes
 * videographer to /app/my-clients, client to /app/portal, and neither
 * of their ALLOWED_PREFIXES cover /app/clients), and every write here
 * goes through client_staff's RLS (Phase 3: ceo/staff full access),
 * so even a direct API call from an unauthorized session would fail
 * at the database.
 */
export function AssignedTeamPanel({
  clientId,
  initialAssignments,
  assignableProfiles,
}: {
  clientId: string;
  initialAssignments: AssignedTeamMember[];
  assignableProfiles: AssignableProfile[];
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const assignedIds = new Set(assignments.map((a) => a.staffId));
  const options = assignableProfiles.filter((p) => !assignedIds.has(p.id));

  async function addAssignment() {
    if (!selected) return;
    const profile = assignableProfiles.find((p) => p.id === selected);
    if (!profile) return;

    setError(null);
    const prev = assignments;
    setAssignments((a) => [...a, { staffId: profile.id, fullName: profile.fullName, role: profile.role, roleOnClient: null }]); // optimistic
    setSelected("");

    const { error: insertError } = await supabase
      .from("client_staff")
      .insert({ client_id: clientId, staff_id: profile.id });

    if (insertError) {
      setAssignments(prev);
      setError(insertError.message);
    }
  }

  async function removeAssignment(staffId: string) {
    setError(null);
    const prev = assignments;
    setAssignments((a) => a.filter((x) => x.staffId !== staffId)); // optimistic

    const { error: deleteError } = await supabase
      .from("client_staff")
      .delete()
      .eq("client_id", clientId)
      .eq("staff_id", staffId);

    if (deleteError) {
      setAssignments(prev);
      setError(deleteError.message);
    }
  }

  return (
    <div>
      {assignments.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          Nobody assigned yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {assignments.map((a) => (
            <li
              key={a.staffId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
              }}
            >
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-1)" }}>
                {a.fullName ?? "Unnamed"}{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase" }}>
                  {a.role}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAssignment(a.staffId)}
                title="Remove"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-1)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
          }}
        >
          <option value="">Add a team member…</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.fullName ?? "Unnamed") + ` (${p.role})`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addAssignment}
          disabled={!selected}
          style={{
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--text-1)",
            background: "var(--text-1)",
            color: "var(--bg)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            cursor: selected ? "pointer" : "default",
            opacity: selected ? 1 : 0.5,
          }}
        >
          Add
        </button>
      </div>
      {error && (
        <span style={{ display: "block", fontSize: 11, color: "var(--status-closed)", marginTop: 6 }}>
          {error}
        </span>
      )}
    </div>
  );
}
