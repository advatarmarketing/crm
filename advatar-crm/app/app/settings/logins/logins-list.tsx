"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetLoginPassword, updateLoginName } from "./actions";

export interface LoginRow {
  id: string;
  fullName: string | null;
  role: string;
  email: string | null;
  clientName: string | null;
  lastSignInAt: string | null;
  /** False when the caller's own role isn't allowed to touch this one. */
  manageable: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  ceo: "CEO",
  operations_manager: "Ops manager",
  staff: "Staff",
  videographer: "Videographer",
  client: "Client",
};

export function LoginsList({ logins }: { logins: LoginRow[] }) {
  const [filter, setFilter] = useState("all");

  const roles = Array.from(new Set(logins.map((l) => l.role)));
  const shown = filter === "all" ? logins : logins.filter((l) => l.role === filter);

  return (
    <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {roles.map((r) => (
          <FilterChip
            key={r}
            label={ROLE_LABEL[r] ?? r}
            active={filter === r}
            onClick={() => setFilter(r)}
          />
        ))}
      </div>

      {shown.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
          No logins to show.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((l) => (
            <LoginItem key={l.id} login={l} />
          ))}
        </ul>
      )}
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "6px 11px",
        borderRadius: 20,
        cursor: "pointer",
        border: "1px solid var(--border)",
        background: active ? "var(--text-1)" : "var(--surface)",
        color: active ? "var(--bg)" : "var(--text-2)",
      }}
    >
      {label}
    </button>
  );
}

function LoginItem({ login }: { login: LoginRow }) {
  const [name, setName] = useState(login.fullName ?? "");
  const [busy, setBusy] = useState<"name" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const router = useRouter();

  const dirty = name.trim() !== (login.fullName ?? "").trim();

  async function saveName() {
    setBusy("name");
    setError(null);
    const { error: saveError } = await updateLoginName(login.id, name);
    setBusy(null);
    if (saveError) return setError(saveError);
    router.refresh();
  }

  async function doReset() {
    setBusy("reset");
    setError(null);
    setConfirmingReset(false);
    const { error: resetError, tempPassword } = await resetLoginPassword(login.id);
    setBusy(null);
    if (resetError) return setError(resetError);
    setNewPassword(tempPassword);
  }

  return (
    <li
      style={{
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          {login.manageable ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add a name"
              aria-label={`Name for ${login.email ?? "this login"}`}
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
          ) : (
            <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
              {login.fullName?.trim() || "Name not set"}
            </span>
          )}

          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-3)",
              marginTop: 5,
              lineHeight: 1.6,
            }}
          >
            {login.email ?? "no email on file"}
            <br />
            {ROLE_LABEL[login.role] ?? login.role}
            {login.clientName ? ` · ${login.clientName}` : ""}
            {" · "}
            {login.lastSignInAt
              ? `last signed in ${new Date(login.lastSignInAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`
              : "never signed in"}
          </span>
        </div>

        {login.manageable && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {dirty && (
              <button
                type="button"
                onClick={saveName}
                disabled={busy !== null || !name.trim()}
                className="btn"
                style={{ opacity: busy !== null || !name.trim() ? 0.5 : 1 }}
              >
                {busy === "name" ? "Saving…" : "Save name"}
              </button>
            )}

            {confirmingReset ? (
              <>
                <button type="button" onClick={doReset} disabled={busy !== null} className="btn btn-primary">
                  {busy === "reset" ? "Resetting…" : "Yes, reset"}
                </button>
                <button type="button" onClick={() => setConfirmingReset(false)} className="btn">
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                disabled={busy !== null}
                className="btn"
              >
                Reset password
              </button>
            )}
          </div>
        )}
      </div>

      {confirmingReset && (
        <p style={{ margin: "10px 0 0", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)" }}>
          This replaces their current password immediately. They won't be able to
          sign in with the old one, so only do this if you can pass the new
          password to them now.
        </p>
      )}

      {newPassword && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
          }}
        >
          <span
            style={{
              display: "block",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-3)",
              marginBottom: 6,
            }}
          >
            New temporary password — shown once
          </span>
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 17,
              color: "var(--text-1)",
              userSelect: "all",
            }}
          >
            {newPassword}
          </code>
          <p style={{ margin: "8px 0 0", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)" }}>
            Send this to them now. It is not saved and won't be shown again.
          </p>
        </div>
      )}

      {error && (
        <p style={{ margin: "8px 0 0", color: "var(--status-closed)", fontSize: 12.5 }}>{error}</p>
      )}
    </li>
  );
}
