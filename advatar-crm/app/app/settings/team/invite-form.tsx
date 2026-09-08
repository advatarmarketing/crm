"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { inviteTeamMember, type InviteState } from "./actions";

const initialState: InviteState = { error: null, success: null };

export function InviteForm() {
  const [state, formAction] = useFormState(inviteTeamMember, initialState);

  return (
    <form action={formAction}>
      {/* Captured at invite time so profiles.full_name is populated
          from the start — otherwise the person shows up as "Unnamed"
          on every client they're assigned to. */}
      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Full name</span>
        <input
          name="full_name"
          type="text"
          required
          style={inputStyle}
          placeholder="Jordan Smith"
        />
      </label>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Email</span>
        <input
          name="email"
          type="email"
          required
          style={inputStyle}
          placeholder="name@example.com"
        />
      </label>

      <label style={{ display: "block", marginBottom: 24 }}>
        <span style={labelStyle}>Role</span>
        <select name="role" required defaultValue="staff" style={inputStyle}>
          <option value="staff">Staff</option>
          <option value="operations_manager">Operations Manager</option>
          <option value="videographer">Videographer</option>
          <option value="ceo">CEO</option>
        </select>
      </label>

      {state.error && (
        <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 16 }}>
          {state.error}
        </p>
      )}
      {state.success && (
        <p style={{ color: "var(--status-active)", fontSize: 13, marginBottom: 16 }}>
          {state.success}
        </p>
      )}

      <SubmitButton />
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "12px 24px",
        borderRadius: "var(--radius-sm)",
        border: "none",
        background: "var(--text-1)",
        color: "var(--bg)",
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        fontSize: 14,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "Sending…" : "Send invite"}
    </button>
  );
}
