import type { CSSProperties } from "react";
import type { SubmissionStatus } from "@/lib/supabase/types";

/**
 * The Uploads tab's shared look, in one place.
 *
 * These were copied between four components while this was being
 * built, which is how the same input ends up three different heights
 * on three different panels. Semantic tokens throughout, never a hex:
 * the whole tab has to read correctly in dark mode, and a hard-coded
 * grey is exactly what made the content plan unreadable there.
 */
export const field: CSSProperties = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  minWidth: 0,
};

export const subheading: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  marginBottom: 8,
};

export const meta: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  color: "var(--text-3)",
};

export const errorText: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12.5,
  color: "var(--danger-fg)",
  margin: "8px 0 0",
};

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/**
 * Status to tone, never to a fixed hex — the two states that need
 * somebody to do something ("in review", "changes requested") are the
 * two carrying warm colour, in both themes.
 */
export const STATUS_FG: Record<SubmissionStatus, string> = {
  submitted: "var(--info-fg)",
  in_review: "var(--warn-fg)",
  changes_requested: "var(--danger-fg)",
  approved: "var(--ok-fg)",
};

export const STATUS_BG: Record<SubmissionStatus, string> = {
  submitted: "var(--info-bg)",
  in_review: "var(--warn-bg)",
  changes_requested: "var(--danger-bg)",
  approved: "var(--ok-bg)",
};

export const STATUS_BORDER: Record<SubmissionStatus, string> = {
  submitted: "var(--info-border)",
  in_review: "var(--warn-border)",
  changes_requested: "var(--danger-border)",
  approved: "var(--ok-border)",
};

/** A filename Storage will accept, with its extension intact. */
export function safeObjectName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

/** "2.4 MB". Used wherever a stored file's size is shown. */
export function formatBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
