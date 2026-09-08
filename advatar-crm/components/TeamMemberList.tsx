"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTeamMemberName } from "@/app/app/settings/team/actions";

export interface TeamMemberRow {
  id: string;
  fullName: string | null;
  role: string;
  /**
   * Read from auth.users on the server (CEO-only page, service-role
   * client). profiles has no email column, and without something to
   * identify a person by, a list of "Unnamed" rows would be
   * impossible to fill in correctly.
   */
  email: string | null;
}

/**
 * CEO-only: names the team members who don't have one yet.
 *
 * Everyone invited before the invite form collected a name exists
 * with profiles.full_name = null, and nothing in the app could write
 * that column — which is what produced "Unnamed videographer"
 * wherever an assigned team member is displayed. This is the repair
 * screen for that existing data; new invites now arrive with a name
 * already set.
 */
export function TeamMemberList({ members }: { members: TeamMemberRow[] }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {members.map((m) => (
        <TeamMemberItem key={m.id} member={m} />
      ))}
    </ul>
  );
}

function TeamMemberItem({ member }: { member: TeamMemberRow }) {
  const [name, setName] = useState(member.fullName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const dirty = name.trim() !== (member.fullName ?? "").trim();

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: saveError } = await updateTeamMemberName(member.id, name);
    setBusy(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 200px" }}>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="Add a name"
          aria-label={`Name for ${member.email ?? "team member"}`}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-1)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
          }}
        />
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-3)",
            marginTop: 4,
          }}
        >
          {member.email ?? "no email on file"} · {member.role}
        </span>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy || !dirty || !name.trim()}
        className="btn"
        style={{ opacity: busy || !dirty || !name.trim() ? 0.5 : 1, flexShrink: 0 }}
      >
        {busy ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
      </button>

      {error && (
        <span style={{ color: "var(--status-closed)", fontSize: 12.5, flexBasis: "100%" }}>{error}</span>
      )}
    </li>
  );
}
