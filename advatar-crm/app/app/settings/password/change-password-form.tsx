"use client";

import { useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Changes the signed-in user's own password.
 *
 * Runs in the browser under the user's own session — Supabase's
 * updateUser only ever touches the caller's own account, so no admin
 * client and no role check are involved. Anyone with a login can use
 * this, which is the point: logins are handed over with a temporary
 * password, and this is where that gets replaced.
 */
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword("");
    setConfirm("");
    setDone(true);
  }

  return (
    <form onSubmit={submit}>
      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>New password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          style={inputStyle}
          placeholder="At least 8 characters"
        />
      </label>

      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={labelStyle}>Confirm new password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          style={inputStyle}
          placeholder="Type it again"
        />
      </label>

      {error && <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 16 }}>{error}</p>}
      {done && (
        <p style={{ color: "var(--status-active)", fontSize: 13, marginBottom: 16 }}>
          Password changed. Use the new one next time you sign in.
        </p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};
