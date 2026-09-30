"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetLoginPassword,
  setLoginPassword,
  updateLoginName,
  updateLoginNotifyEmail,
} from "./actions";
import { displayName } from "@/lib/names";

export interface LoginRow {
  id: string;
  fullName: string | null;
  role: string;
  email: string | null;
  clientName: string | null;
  lastSignInAt: string | null;
  /**
   * Where the CRM emails them. Null means it falls back to their
   * sign-in address — which is why the input below shows that address
   * as its placeholder rather than sitting empty and unexplained.
   */
  notifyEmail: string | null;
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
  const [notify, setNotify] = useState(login.notifyEmail ?? "");
  const [busy, setBusy] = useState<"name" | "reset" | "set" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // The chosen-password panel. `chosen` is what will be sent; `setDone`
  // keeps the confirmation on screen after the panel closes, so the
  // row still says what happened.
  const [settingPassword, setSettingPassword] = useState(false);
  const [chosen, setChosen] = useState("");
  const [setDone, setSetDone] = useState(false);
  const router = useRouter();

  const nameDirty = name.trim() !== (login.fullName ?? "").trim();
  const notifyDirty = notify.trim() !== (login.notifyEmail ?? "").trim();
  const dirty = nameDirty || notifyDirty;

  /**
   * One button for both fields.
   *
   * They are two separate writes underneath — the name also syncs to
   * auth metadata, the address does not — but from here it is one
   * edit to one person, and two Save buttons on a row would be two
   * decisions where there is only one.
   */
  async function saveDetails() {
    setBusy("name");
    setError(null);

    if (nameDirty) {
      const { error: nameError } = await updateLoginName(login.id, name);
      if (nameError) {
        setBusy(null);
        return setError(nameError);
      }
    }

    if (notifyDirty) {
      const { error: mailError } = await updateLoginNotifyEmail(login.id, notify);
      if (mailError) {
        setBusy(null);
        return setError(mailError);
      }
    }

    setBusy(null);
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

  async function doSetPassword() {
    setBusy("set");
    setError(null);
    const { error: setError_ } = await setLoginPassword(login.id, chosen);
    setBusy(null);
    if (setError_) return setError(setError_);

    // The password stays on screen in the input until the panel is
    // closed deliberately — this is the one moment it can be read
    // back, and clearing it the instant it saves is how people end up
    // having set something they can no longer remember.
    setSetDone(true);
  }

  function closeSetPanel() {
    setSettingPassword(false);
    setChosen("");
    setSetDone(false);
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
              {displayName(login.fullName)}
            </span>
          )}

          {login.manageable && (
            <label style={{ display: "block", marginTop: 8 }}>
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginBottom: 4,
                }}
              >
                Email for notifications
              </span>
              <input
                value={notify}
                onChange={(e) => setNotify(e.target.value)}
                type="email"
                inputMode="email"
                // The sign-in address as the placeholder, so leaving
                // it blank visibly means "send it there".
                placeholder={login.email ?? "you@example.com"}
                aria-label={`Notification email for ${login.fullName ?? login.email ?? "this login"}`}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  color: "var(--text-1)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13.5,
                }}
              />
            </label>
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
            {login.notifyEmail ? `mail to ${login.notifyEmail}` : "mail to the sign-in address"}
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
                onClick={saveDetails}
                disabled={busy !== null || !name.trim()}
                className="btn"
                style={{ opacity: busy !== null || !name.trim() ? 0.5 : 1 }}
              >
                {busy === "name" ? "Saving…" : "Save"}
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
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSettingPassword((open) => !open);
                    setSetDone(false);
                    setError(null);
                  }}
                  disabled={busy !== null}
                  className="btn"
                  aria-expanded={settingPassword}
                >
                  {settingPassword ? "Close" : "Set password"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  disabled={busy !== null}
                  className="btn"
                >
                  Reset password
                </button>
              </>
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

      {settingPassword && (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
          }}
        >
          <label style={{ display: "block" }}>
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
              Password for {displayName(login.fullName)}
            </span>
            <input
              // Deliberately a plain text field, not type="password".
              // The entire point of this panel is that the person
              // using it is meant to read what they are setting, and
              // dots would hide the one thing it exists to show.
              type="text"
              value={chosen}
              onChange={(e) => {
                setChosen(e.target.value);
                setSetDone(false);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="At least 8 characters"
              aria-label={`New password for ${login.fullName ?? login.email ?? "this login"}`}
              style={{
                width: "100%",
                padding: "9px 11px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-1)",
                fontFamily: "var(--font-mono)",
                fontSize: 15,
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={doSetPassword}
              disabled={busy !== null || chosen.length < 8}
              className="btn btn-primary"
              style={{ opacity: busy !== null || chosen.length < 8 ? 0.5 : 1 }}
            >
              {busy === "set" ? "Setting…" : "Set this password"}
            </button>
            <button type="button" onClick={closeSetPanel} className="btn">
              Done
            </button>
          </div>

          {setDone ? (
            <p
              style={{
                margin: "10px 0 0",
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                color: "var(--text-1)",
              }}
            >
              Set. {displayName(login.fullName)} signs in with this now — write it
              down before you press Done, because it can&rsquo;t be read back
              afterwards. If they change it themselves in Settings &rarr;
              Password, yours stops working and you won&rsquo;t be told.
            </p>
          ) : (
            <p
              style={{
                margin: "10px 0 0",
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                color: "var(--text-2)",
              }}
            >
              This replaces their current password straight away. Their old one
              stops working.
            </p>
          )}
        </div>
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
