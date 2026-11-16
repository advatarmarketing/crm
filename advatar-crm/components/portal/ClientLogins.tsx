"use client";

import { useEffect, useRef, useState } from "react";
import { revealOwnLoginAction } from "@/app/app/portal/logins/actions";

export interface ClientLogin {
  id: string;
  platform: string;
  label: string | null;
  username: string | null;
  url: string | null;
  hasPassword: boolean;
}

const HIDE_AFTER_MS = 60_000;

/**
 * The client's own saved logins, read-only. One password shown at a
 * time, hidden again after a minute.
 */
export function ClientLogins({ logins }: { logins: ClientLogin[] }) {
  const [shown, setShown] = useState<{ id: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function reveal(id: string) {
    if (shown?.id === id) {
      setShown(null);
      return;
    }
    setBusy(id);
    setError(null);
    const res = await revealOwnLoginAction(id);
    setBusy(null);
    if (res.error) return setError(res.error);
    if (!res.password) return setError("No password is saved for this one.");
    setShown({ id, password: res.password });
    setCopied(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), HIDE_AFTER_MS);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* the password is on screen to copy by hand */
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && (
        <p role="alert" style={{ color: "var(--danger-fg)", fontSize: 14, margin: 0 }}>
          {error}
        </p>
      )}
      {logins.map((l) => (
        <div key={l.id} className="card card-pad-sm" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {l.platform}
              {l.label ? <span style={{ color: "var(--text-3)", fontWeight: 400 }}> · {l.label}</span> : null}
            </div>
            {l.username && <div style={{ fontSize: 14, color: "var(--text-2)", wordBreak: "break-all" }}>{l.username}</div>}
            {l.url && (
              <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                Open {l.platform} ↗
              </a>
            )}
          </div>
          {l.hasPassword && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {shown?.id === l.id && (
                <>
                  <code style={{ fontSize: 15, padding: "4px 8px", background: "var(--surface-2)", borderRadius: 6, wordBreak: "break-all" }}>
                    {shown.password}
                  </code>
                  <button type="button" className="btn" onClick={() => copy(shown.password)}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </>
              )}
              <button type="button" className="btn" onClick={() => reveal(l.id)} disabled={busy === l.id}>
                {shown?.id === l.id ? "Hide" : busy === l.id ? "…" : "Show password"}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
