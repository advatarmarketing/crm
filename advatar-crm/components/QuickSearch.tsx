"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Hit {
  id: string;
  name: string;
  stage: string | null;
  service: string | null;
}

/**
 * Jump to any client or lead from anywhere.
 *
 * The query runs through the browser Supabase client under the user's
 * own session, so `clients` RLS applies exactly as it does on every
 * other screen: a staff member searching here can only ever match the
 * clients they're assigned to. This is a shortcut to something they
 * could already reach, never a way around the permission model.
 *
 * Opens on the "/" key, closes on Escape, and is limited to eight
 * results — it exists to get somewhere in two keystrokes, not to
 * replace the Clients page.
 */
export function QuickSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typingElsewhere =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "/" && !typingElsewhere) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced so a five-letter name is one request, not five.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      const supabase = createClient();
      // `or` with ilike across the fields someone would actually
      // remember. Commas inside the pattern would break the filter
      // syntax, so they're stripped rather than escaped.
      const safe = q.replace(/[,()]/g, " ");
      const { data } = await supabase
        .from("clients")
        .select("id, name, stage, service")
        .or(`name.ilike.%${safe}%,contact_name.ilike.%${safe}%,contact_email.ilike.%${safe}%,service.ilike.%${safe}%`)
        .limit(8);

      if (!cancelled) {
        setHits((data ?? []) as Hit[]);
        setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function go(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/app/clients/${id}`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search clients"
        title="Search clients (press /)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text-2)",
          cursor: "pointer",
          flexShrink: 0,
          padding: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search clients"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12vh 16px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients and leads…"
          aria-label="Search clients and leads"
          style={{
            width: "100%",
            padding: "16px 18px",
            border: "none",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-1)",
            fontFamily: "var(--font-body)",
            fontSize: 16,
            outline: "none",
            borderRadius: 0,
          }}
        />

        <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
          {query.trim().length < 2 ? (
            <p style={{ padding: "14px 18px", margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
              Type at least two letters
            </p>
          ) : loading ? (
            <p style={{ padding: "14px 18px", margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
              Searching…
            </p>
          ) : hits.length === 0 ? (
            <p style={{ padding: "14px 18px", margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
              Nothing found
            </p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => go(hit.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  width: "100%",
                  padding: "12px 18px",
                  minHeight: 48,
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text-1)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, minWidth: 0 }}>
                  {hit.name}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    flexShrink: 0,
                  }}
                >
                  {[hit.stage, hit.service].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
