"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

type Tab = "client" | "staff";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("client");
  const [state, formAction] = useFormState(login, initialState);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "40px 36px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 40,
            letterSpacing: "0.03em",
            margin: "0 0 4px",
            backgroundImage: "var(--chrome-text)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          ADVATAR
        </h1>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-3)",
            margin: "0 0 32px",
            letterSpacing: "0.05em",
          }}
        >
          SIGN IN TO YOUR ACCOUNT
        </p>

        {/* Exactly two tabs — Client and Staff. No CEO tab, no
            account picker. Switching tabs only clears the fields and
            changes the hint copy below; it sets no role and performs
            no autofill. Routing after sign-in is entirely determined
            by profiles.role via the login() server action. */}
        <div
          role="tablist"
          aria-label="Login type"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 24,
          }}
        >
          {(["client", "staff"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "10px 0",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${tab === t ? "var(--text-1)" : "var(--border)"}`,
                background: tab === t ? "var(--surface-2)" : "transparent",
                color: tab === t ? "var(--text-1)" : "var(--text-3)",
                cursor: "pointer",
              }}
            >
              {t === "client" ? "Client" : "Staff"}
            </button>
          ))}
        </div>

        <form action={formAction} key={tab} autoComplete="off">
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="off"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="off"
          />

          {state.error && (
            <p
              role="alert"
              style={{
                color: "var(--status-closed)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                margin: "0 0 16px",
              }}
            >
              {state.error}
            </p>
          )}

          <SubmitButton />
        </form>

        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-3)",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          {tab === "client"
            ? "Client access to your project and planner."
            : "Staff, videographer, and CEO logins use this tab."}
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-2)",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue=""
        required
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text-1)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
        }}
      />
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        padding: "12px 0",
        marginTop: 8,
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
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
