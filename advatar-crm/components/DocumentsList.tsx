"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { deleteDocument, getDocumentDownloadUrl } from "@/app/app/clients/[id]/actions";
import type { Database } from "@/lib/supabase/types";

type Document = Database["public"]["Tables"]["documents"]["Row"];

const STATUS_OPTIONS = ["draft", "in review", "approved", "delivered"];

export function DocumentsList({
  initialDocuments,
  editable = true,
  clientId,
}: {
  initialDocuments: Document[];
  /**
   * Phase 15: supplied on the client detail page, where documents can
   * be opened and removed. Omitted on read-only surfaces (the
   * videographer's client view), where the list stays exactly as it
   * was.
   */
  clientId?: string;
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  // The bucket is private, so there is no permanent link to put in an
  // href — a fresh short-lived signed URL is minted per click.
  async function openDocument(id: string) {
    setBusyId(id);
    setError(null);
    const { url, error } = await getDocumentDownloadUrl(id);
    setBusyId(null);
    if (error || !url) {
      setError(error ?? "Could not open that file.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(id: string) {
    if (!clientId) return;
    setBusyId(id);
    setError(null);
    const prev = documents;
    setDocuments((docs) => docs.filter((d) => d.id !== id)); // optimistic
    const { error } = await deleteDocument(id, clientId);
    setBusyId(null);
    if (error) {
      setDocuments(prev);
      setError(error);
      return;
    }
    router.refresh();
  }

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
      <>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
          No documents yet.
        </p>
        {error && <p style={{ color: "var(--status-closed)", fontSize: 13 }}>{error}</p>}
      </>
    );
  }

  return (
    <>
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
            {doc.storage_path || doc.url ? (
              <button
                type="button"
                onClick={() => openDocument(doc.id)}
                disabled={busyId === doc.id}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  color: "var(--text-1)",
                  fontWeight: 600,
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                {busyId === doc.id ? "Opening…" : doc.name}
              </button>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
          {editable && clientId && (
            <button
              type="button"
              onClick={() => removeDocument(doc.id)}
              disabled={busyId === doc.id}
              aria-label={`Delete ${doc.name}`}
              title="Delete"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-3)",
                cursor: "pointer",
                padding: 4,
                lineHeight: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          )}
          </div>
        </li>
      ))}
    </ul>
    {error && <p style={{ color: "var(--status-closed)", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </>
  );
}
