"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { createClientRecord, type CreateClientState } from "./actions";

const initialState: CreateClientState = { error: null };

/**
 * One form for both "add a client" and "add a lead" — they're the
 * same `clients` row, just a different `stage`. `defaultStage` lets
 * /app/leads/new (or a future entry point) open this pre-set to
 * "lead" without needing a separate form/component.
 */
export function NewClientForm({ defaultStage = "lead" }: { defaultStage?: "lead" | "proposal" | "active" }) {
  const [state, formAction] = useFormState(createClientRecord, initialState);

  return (
    <form action={formAction}>
      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Name</span>
        <input name="name" required style={inputStyle} placeholder="Client or business name" />
      </label>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Stage</span>
        <select name="stage" required defaultValue={defaultStage} style={inputStyle}>
          <option value="lead">Lead</option>
          <option value="proposal">Proposal</option>
          <option value="active">Active</option>
        </select>
      </label>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Contact name</span>
          <input name="contact_name" style={inputStyle} placeholder="Optional" />
        </label>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Contact email</span>
          <input name="contact_email" type="email" style={inputStyle} placeholder="Optional" />
        </label>
      </div>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={labelStyle}>Service</span>
        <input name="service" style={inputStyle} placeholder="e.g. Social media, Videography" />
      </label>

      <label style={{ display: "block", marginBottom: 24 }}>
        <span style={labelStyle}>Next action</span>
        <input name="next_action" style={inputStyle} placeholder="What needs to happen next" />
      </label>

      <p style={{ ...labelStyle, marginBottom: 12, color: "var(--text-3)" }}>
        Lead tracking (only matters while stage is "Lead")
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Source</span>
          <input name="lead_source" style={inputStyle} placeholder="e.g. Referral, Instagram, cold outreach" />
        </label>
        <label style={{ display: "block", flex: 1 }}>
          <span style={labelStyle}>Temperature</span>
          <select name="lead_temperature" defaultValue="" style={inputStyle}>
            <option value="">Not set</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
        </label>
      </div>

      <label style={{ display: "block", marginBottom: 24 }}>
        <span style={labelStyle}>Follow up on</span>
        <input name="follow_up_date" type="date" style={inputStyle} />
      </label>

      {state.error && (
        <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 16 }}>{state.error}</p>
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
      {pending ? "Saving…" : "Save"}
    </button>
  );
}
