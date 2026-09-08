"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createLogin, type CreateLoginState } from "./actions";
import { TempPasswordNotice } from "./temp-password-notice";

const initialState: CreateLoginState = { error: null, success: null, tempPassword: null };

export interface ClientOption {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO — full access to everything",
  operations_manager: "Operations manager — everything except wages and client value",
  staff: "Staff — only the clients they're assigned to",
  videographer: "Videographer — read-only, only their assigned clients",
  client: "Client — their own portal only",
};

export function CreateLoginForm({
  creatableRoles,
  clients,
}: {
  creatableRoles: string[];
  clients: ClientOption[];
}) {
  const [state, formAction] = useFormState(createLogin, initialState);
  const [role, setRole] = useState(creatableRoles[0] ?? "staff");
  const router = useRouter();

  return (
    <form
      action={formAction}
      // The list below this form needs to pick up the new login once
      // the action returns.
      onSubmit={() => setTimeout(() => router.refresh(), 400)}
    >
      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Full name</span>
        <input name="full_name" type="text" required style={inputStyle} placeholder="Jordan Smith" />
      </label>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Email</span>
        <input name="email" type="email" required style={inputStyle} placeholder="name@example.com" />
      </label>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Role</span>
        <select
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={inputStyle}
        >
          {creatableRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] ?? r}
            </option>
          ))}
        </select>
      </label>

      {/* Only a client login needs a client attached, and it must have
          one — without it the portal has nothing to show. */}
      {role === "client" && (
        <label style={{ display: "block", marginBottom: 16 }}>
          <span style={labelStyle}>Which client?</span>
          <select name="client_id" required style={inputStyle} defaultValue="">
            <option value="" disabled>
              Choose a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clients.length === 0 && (
            <span style={{ display: "block", fontSize: 12.5, color: "var(--text-3)", marginTop: 6 }}>
              No clients yet — add one under Clients first.
            </span>
          )}
        </label>
      )}

      {state.error && (
        <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 16 }}>{state.error}</p>
      )}

      {state.success && state.tempPassword && (
        <TempPasswordNotice message={state.success} password={state.tempPassword} />
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary" style={{ opacity: pending ? 0.6 : 1 }}>
      {pending ? "Creating…" : "Create login"}
    </button>
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
