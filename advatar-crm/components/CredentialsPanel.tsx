"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCredentialAction,
  revealCredentialAction,
  saveCredentialAction,
  type CredentialSummary,
} from "@/app/app/clients/[id]/credential-actions";

/**
 * A client's social media logins.
 *
 * Two rules shape everything here:
 *
 *   1. A password is never on the page until somebody asks for it.
 *      The server sends the platform, the handle and "there is a
 *      password saved" — never the password, and never the encrypted
 *      form of it either. Pressing Show fetches that one password,
 *      for that one person, and it clears itself again shortly after.
 *
 *   2. The form can never show an existing password, so saving an
 *      edit leaves it alone unless the password box was actually
 *      typed in. That is `passwordMode` in the action.
 *
 * Who can open this tab at all is decided by 0039's row level
 * security, not by this file: management and assigned staff, never a
 * videographer and never the client.
 */

/** Suggestions only — the field takes anything typed into it. */
const PLATFORMS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "YouTube",
  "LinkedIn",
  "X (Twitter)",
  "Pinterest",
  "Snapchat",
  "Threads",
  "Google Business Profile",
  "Meta Business Suite",
  "Canva",
  "Email",
  "Website",
];

/** How long a revealed password stays on screen. Long enough to read
 * it out or paste it, short enough that a tab left open on a desk is
 * not a password left open on a desk. */
const HIDE_AFTER_MS = 90_000;

type Draft = {
  id: string | null;
  platform: string;
  label: string;
  username: string;
  url: string;
  password: string;
  notes: string;
  /** True once the password box has been touched, so an untouched box
   * means "keep what is saved" rather than "clear it". */
  passwordTouched: boolean;
  notesTouched: boolean;
  /** An existing login whose notes we cannot show without unlocking. */
  notesLocked: boolean;
};

function emptyDraft(): Draft {
  return {
    id: null,
    platform: "",
    label: "",
    username: "",
    url: "",
    password: "",
    notes: "",
    passwordTouched: false,
    notesTouched: false,
    notesLocked: false,
  };
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  marginBottom: 6,
};

const helpStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-2)",
  lineHeight: 1.6,
  margin: "0 0 18px",
};

export function CredentialsPanel({
  clientId,
  clientName,
  initial,
  available,
  keyProblem,
  suggestedKey,
  isCeo,
}: {
  clientId: string;
  clientName: string;
  initial: CredentialSummary[];
  /** False until database update 0039 has been run. */
  available: boolean;
  keyProblem: "missing" | "too-short" | null;
  /** A key the CEO can paste into Vercel, when there isn't one yet. */
  suggestedKey: string;
  isCeo: boolean;
}) {
  const router = useRouter();

  const [rows, setRows] = useState<CredentialSummary[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [open, setOpen] = useState<{
    id: string;
    password: string | null;
    notes: string | null;
    warning: string | null;
  } | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Nothing should outlive the tab being closed — least of all a
    // timer that is holding a password.
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  function hide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setOpen(null);
  }

  async function reveal(row: CredentialSummary) {
    setError(null);
    if (open?.id === row.id) {
      hide();
      return;
    }

    setBusy(true);
    const result = await revealCredentialAction(row.id);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen({
      id: row.id,
      password: result.password ?? null,
      notes: result.notes ?? null,
      warning: result.warning ?? null,
    });

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(null), HIDE_AFTER_MS);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Your browser wouldn’t let the page copy that. Select it and copy it by hand.");
    }
  }

  function startEdit(row: CredentialSummary) {
    hide();
    setError(null);
    setDraft({
      id: row.id,
      platform: row.platform,
      label: row.label ?? "",
      username: row.username ?? "",
      url: row.url ?? "",
      password: "",
      notes: "",
      passwordTouched: false,
      notesTouched: false,
      notesLocked: row.hasNotes,
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.platform.trim()) {
      setError("Say which platform this login is for.");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await saveCredentialAction({
      clientId,
      id: draft.id,
      platform: draft.platform,
      label: draft.label,
      username: draft.username,
      url: draft.url,
      // A new login always writes both; an edit writes only what was
      // typed into, so an untouched password box keeps the password.
      passwordMode: draft.id === null || draft.passwordTouched ? "set" : "keep",
      password: draft.password,
      notesMode: draft.id === null || draft.notesTouched ? "set" : "keep",
      notes: draft.notes,
    });

    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setDraft(null);
    router.refresh();
  }

  async function remove(row: CredentialSummary) {
    setBusy(true);
    setError(null);
    hide();

    const result = await deleteCredentialAction(clientId, row.id);

    setBusy(false);
    setConfirmingId(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== row.id));
    router.refresh();
  }

  // The server is the source of truth after every save; this keeps
  // the list in step with a refresh without a second round trip.
  useEffect(() => {
    setRows(initial);
  }, [initial]);

  if (!available) {
    return (
      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 10px" }}>
          Passwords aren’t switched on yet
        </h3>
        <p style={{ ...helpStyle, marginBottom: 0 }}>
          This needs one database update (0039) before logins can be saved. Nothing has been lost — there is
          nothing here yet to lose.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={helpStyle}>
        The logins for {clientName}’s accounts, so whoever is posting doesn’t have to go and ask. Passwords are
        encrypted before they are saved and are never shown until you press <strong>Show</strong>. Only you, the
        office and the staff assigned to this client can open this tab — videographers and the client cannot.
      </p>

      {keyProblem && <KeyWarning problem={keyProblem} suggestedKey={suggestedKey} isCeo={isCeo} />}

      {error && (
        <p
          role="alert"
          style={{ fontSize: 13, color: "var(--danger-fg)", margin: "0 0 16px", lineHeight: 1.6 }}
        >
          {error}
        </p>
      )}

      {rows.length === 0 && !draft && (
        <p style={{ fontSize: 14, color: "var(--text-3)", margin: "0 0 18px" }}>
          No logins saved for {clientName} yet.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
        {rows.map((row) => {
          const showing = open?.id === row.id;
          return (
            <div key={row.id} className="card card-pad-sm">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <strong style={{ fontFamily: "var(--font-display)", fontSize: 17 }}>{row.platform}</strong>
                {row.label && <span style={{ fontSize: 13, color: "var(--text-3)" }}>{row.label}</span>}
                {row.staleKey && (
                  <span className="pill pill-warn" title="Saved with a key that has since been changed">
                    needs re-entering
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button type="button" className="btn" onClick={() => startEdit(row)} disabled={busy}>
                  Edit
                </button>
                {confirmingId === row.id ? (
                  <>
                    <button type="button" className="btn" onClick={() => remove(row)} disabled={busy}>
                      Really delete
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmingId(null)} disabled={busy}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setConfirmingId(row.id)}
                    disabled={busy}
                    aria-label={`Delete the ${row.platform} login`}
                  >
                    Delete
                  </button>
                )}
              </div>

              {row.username && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-2)" }}>
                    {row.username}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 32, padding: "4px 10px" }}
                    onClick={() => copy(row.username ?? "", `handle-${row.id}`)}
                  >
                    {copied === `handle-${row.id}` ? "Copied" : "Copy"}
                  </button>
                  {row.url && (
                    <a
                      className="btn"
                      style={{ minHeight: 32, padding: "4px 10px" }}
                      href={row.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Open
                    </a>
                  )}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                {row.hasPassword ? (
                  <button type="button" className="btn" onClick={() => reveal(row)} disabled={busy}>
                    {showing ? "Hide" : "Show password"}
                  </button>
                ) : (
                  <span style={{ fontSize: 13, color: "var(--text-3)" }}>
                    No password saved{row.hasNotes ? " — " : ""}
                    {row.hasNotes && (
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: 32, padding: "4px 10px" }}
                        onClick={() => reveal(row)}
                        disabled={busy}
                      >
                        {showing ? "Hide notes" : "Show notes"}
                      </button>
                    )}
                  </span>
                )}
              </div>

              {showing && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {open?.password ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <code
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 15,
                          wordBreak: "break-all",
                          userSelect: "all",
                        }}
                      >
                        {open.password}
                      </code>
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: 32, padding: "4px 10px" }}
                        onClick={() => copy(open.password ?? "", `pw-${row.id}`)}
                      >
                        {copied === `pw-${row.id}` ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--text-3)" }}>No password saved.</span>
                  )}

                  {open?.notes && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--text-2)",
                        margin: "10px 0 0",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {open.notes}
                    </p>
                  )}

                  {open?.warning && (
                    <p style={{ fontSize: 12, color: "var(--danger-fg)", margin: "10px 0 0" }}>{open.warning}</p>
                  )}

                  <p style={{ fontSize: 11, color: "var(--text-3)", margin: "10px 0 0" }}>
                    This hides itself again in a minute and a half.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {draft ? (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "0 0 14px" }}>
            {draft.id ? "Edit login" : "Add a login"}
          </h3>

          <div className="row-2" style={{ marginBottom: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="credPlatform">
                Platform
              </label>
              <input
                id="credPlatform"
                list="credPlatformOptions"
                value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
                placeholder="Instagram"
                autoComplete="off"
              />
              <datalist id="credPlatformOptions">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label style={labelStyle} htmlFor="credLabel">
                Which one (optional)
              </label>
              <input
                id="credLabel"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="main account"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="row-2" style={{ marginBottom: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="credUsername">
                Handle or email
              </label>
              <input
                id="credUsername"
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                placeholder="@theirhandle"
                autoComplete="off"
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="credPassword">
                Password
              </label>
              <input
                id="credPassword"
                type="password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value, passwordTouched: true })}
                placeholder={draft.id ? "leave blank to keep the saved one" : ""}
                // Stops the browser offering to remember it, which
                // would quietly copy the client's password into
                // whoever's personal password manager.
                autoComplete="new-password"
                data-1p-ignore="true"
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle} htmlFor="credUrl">
              Link (optional)
            </label>
            <input
              id="credUrl"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="instagram.com/theirhandle"
              autoComplete="off"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle} htmlFor="credNotes">
              Notes (optional)
            </label>
            <textarea
              id="credNotes"
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value, notesTouched: true })}
              placeholder={
                draft.notesLocked
                  ? "leave blank to keep the saved notes"
                  : "two-factor codes go to the office phone"
              }
              autoComplete="off"
            />
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 0" }}>
              Encrypted the same way the password is, so backup codes are safe here.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setDraft(emptyDraft())} disabled={busy}>
          Add a login
        </button>
      )}
    </div>
  );
}

/**
 * Shown when CREDENTIALS_KEY is not set in Vercel. Everything on the
 * tab still works except saving a password, so this explains rather
 * than blocks — and for the CEO it includes a key to paste, because
 * "generate 32 random characters" is not a reasonable thing to ask
 * of somebody who just wants the Instagram login saved.
 */
export function KeyWarning({
  problem,
  suggestedKey,
  isCeo,
}: {
  problem: "missing" | "too-short";
  suggestedKey: string;
  isCeo: boolean;
}) {
  if (!isCeo) {
    return (
      <div className="card card-pad-sm" style={{ marginBottom: 16, borderColor: "var(--warn-fg)" }}>
        <p style={{ ...helpStyle, marginBottom: 0 }}>
          Passwords can’t be saved yet — the office still has one setting to finish. Handles and links can be
          saved in the meantime.
        </p>
      </div>
    );
  }

  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "0 0 10px" }}>
        One setting left before passwords can be saved
      </h3>
      <p style={helpStyle}>
        {problem === "missing"
          ? "Passwords are locked with a key that is kept in Vercel rather than in the database, so that a copy of the database is of no use to anybody. That key hasn’t been set yet."
          : "The key set in Vercel is too short to be safe — it needs at least 16 characters. Replace it with the one below."}
      </p>
      <ol style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.8, margin: "0 0 14px", paddingLeft: 20 }}>
        <li>
          Open your Vercel project, then <strong>Settings → Environment Variables</strong>.
        </li>
        <li>
          Add one called <code style={{ fontFamily: "var(--font-mono)" }}>CREDENTIALS_KEY</code>, with the value
          below, for all three environments.
        </li>
        <li>Redeploy. Passwords saved after that can be read back; nothing saved before is affected.</li>
      </ol>
      <code
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          padding: 10,
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          wordBreak: "break-all",
          userSelect: "all",
        }}
      >
        {suggestedKey}
      </code>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "10px 0 0", lineHeight: 1.6 }}>
        A fresh suggestion appears each time this page loads — any one of them is fine, use the first you copy.
        Keep a copy somewhere safe: change this key later and the passwords saved under the old one can’t be
        read back, and will need typing in again.
      </p>
    </div>
  );
}
