"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CSSProperties } from "react";
import { createTemplate, type TemplateState } from "./actions";

const initialState: TemplateState = { error: null, success: null };

export function TemplateForm() {
  const [state, formAction] = useFormState(createTemplate, initialState);

  return (
    <form action={formAction} style={{ marginBottom: 40 }}>
      <label style={{ display: "block", marginBottom: 14 }}>
        <span style={labelStyle}>Template name</span>
        <input name="name" required style={inputStyle} placeholder="e.g. New client onboarding" />
      </label>

      <label style={{ display: "block", marginBottom: 14 }}>
        <span style={labelStyle}>Description</span>
        <input name="description" style={inputStyle} placeholder="Optional — what this is for" />
      </label>

      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={labelStyle}>Tasks — one per line</span>
        <textarea
          name="items"
          rows={8}
          required
          style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 13 }}
          defaultValue={"Confirm shoot date | 0\nSend brief to client | 2\nShoot day | 7\nFirst edit to client | 14"}
        />
      </label>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", margin: "0 0 20px" }}>
        Put the number of days after the template is applied after a “|”. No number means the same day.
      </p>

      {state.error && <p style={{ color: "var(--status-closed)", fontSize: 13, marginBottom: 12 }}>{state.error}</p>}
      {state.success && <p style={{ color: "var(--status-active)", fontSize: 13, marginBottom: 12 }}>{state.success}</p>}

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
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary">
      {pending ? "Saving…" : "Create template"}
    </button>
  );
}
