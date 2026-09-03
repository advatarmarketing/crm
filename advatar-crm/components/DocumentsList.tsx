"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Document = Database["public"]["Tables"]["documents"]["Row"];

const STATUS_OPTIONS = ["draft", "in review", "approved", "delivered"];

export function DocumentsList({
  initialDocuments,
  editable = true,
}: {
  initialDocuments: Document[];
  /**
   * Phase 7: a videographer has select-only RLS access to documents
   * (Phase 3), so an update attempt from them would just fail and
   * revert — not wrong, but a status dropdown that looks interactive
   * and silently snaps back is bad UX. Set false to render a plain
   * status badge instead, matching how PlannerDocument already gates
   * its own edit affordances on an explicit prop rather than
   * inferring role.
   */
  editable?: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const supabase = createClient();

  async function updateStatus(id: string, status: string) {
    const prev = documents;
    setDocuments((docs) => docs.map((d) => (d.id === id ? { ...d, status } : d))); // optimistic

    const { error } = await supabase.from("documents").update({ status }).eq("id", id);
    if (error) {
      setDocuments(prev); // revert
    }
  }

  if (documents.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
        No documents yet.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      {documents.map((doc) => (
        <li
          key={doc.id}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {doc.url ? (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  color: "var(--text-1)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {doc.name}
              </a>
            ) : (
              <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-1)", fontWeight: 600 }}>
                {doc.name}
              </span>
            )}
            {doc.type && (
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                }}
              >
                {doc.type}
              </span>
            )}
          </div>
          {editable ? (
            <select
              value={doc.status ?? ""}
              onChange={(e) => updateStatus(doc.id, e.target.value)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "6px 8px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text-1)",
                flexShrink: 0,
              }}
            >
              <option value="">—</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            doc.status && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  padding: "4px 10px",
                  flexShrink: 0,
                }}
              >
                {doc.status}
              </span>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
