"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/names";

export interface AssignedTeamMember {
  staffId: string;
  fullName: string | null;
  role: string;
  roleOnClient: string | null;
  /** Phase 23 — shown next to the name so whoever is on a shoot can
   *  be reached without going to their profile page first. */
  phone?: string | null;
}

export interface AssignableProfile {
  id: string;
  fullName: string | null;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  operations_manager: "Operations",
  staff: "Staff",
  videographer: "Videographer",
};

// Most-often-assigned first, so the dropdown opens on the useful part.
const ROLE_ORDER = ["videographer", "staff", "operations_manager", "ceo"];

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
  canAssign = true,
  assignScope = "everyone",
}: {
  clientId: string;
  initialAssignments: AssignedTeamMember[];
  assignableProfiles: AssignableProfile[];
  /**
   * 0024 narrowed `client_staff` writes to the CEO, so that an
   * operations manager cannot quietly hand themselves a client. This
   * only decides whether the controls are drawn — the database is what
   * refuses the write either way.
   */
  canAssign?: boolean;
  /**
   * What this viewer is allowed to change. An operations manager may
   * add and remove the people who do the work, but not management —
   * so the remove button is hidden on rows they could not remove,
   * rather than offered and then refused.
   */
  assignScope?: "everyone" | "workers";
}) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const assignedIds = new Set(assignments.map((a) => a.staffId));
  const options = assignableProfiles.filter((p) => !assignedIds.has(p.id));

  // Grouped by role. Four roles in one flat list is a wall of names
  // where you have to read every bracketed suffix to find the one you
  // want.
  const grouped = ROLE_ORDER.map((role) => ({
    role,
    people: options.filter((p) => p.role === role),
  })).filter((group) => group.people.length > 0);

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
                {displayName(a.fullName)}{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase" }}>
                  {ROLE_LABEL[a.role] ?? a.role}
                </span>
                {a.phone && (
                  <a
                    href={`tel:${a.phone.replace(/\s+/g, "")}`}
                    style={{
                      display: "block",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--accent)",
                      marginTop: 3,
                      textDecoration: "none",
                    }}
                  >
                    {a.phone}
                  </a>
                )}
              </span>
              {canAssign && (assignScope === "everyone" || a.role === "staff" || a.role === "videographer") && (
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
              )}
            </li>
          ))}
        </ul>
      )}

      {!canAssign ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: 0 }}>
          Only the CEO and the operations manager running this client can
          change who&rsquo;s on it.
        </p>
      ) : (
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
          {grouped.map((group) => (
            <optgroup key={group.role} label={ROLE_LABEL[group.role] ?? group.role}>
              {group.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p.fullName)}
                </option>
              ))}
            </optgroup>
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
      )}

      {canAssign && assignScope === "workers" && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-3)", margin: "8px 0 0" }}>
          You can add and remove staff and videographers here. Changing who
          manages this client is the CEO&rsquo;s.
        </p>
      )}
      {error && (
        <span style={{ display: "block", fontSize: 11, color: "var(--status-closed)", marginTop: 6 }}>
          {error}
        </span>
      )}
    </div>
  );
}
