import Link from "next/link";
import type { ReactNode } from "react";

/**
 * What a section shows when it has nothing in it.
 *
 * The app used a bare line of grey text everywhere, which reads as a
 * page that failed to load rather than one with nothing to show. This
 * gives the empty case a shape, says plainly why it's empty, and where
 * there's an obvious next step, offers it.
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  compact = false,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
  /** Defaults to a neutral mark; pass one that suits the section. */
  icon?: ReactNode;
  /** Inline sections use this — less vertical space, no border. */
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
        padding: compact ? "20px 16px" : "40px 24px",
        border: compact ? "none" : "1px dashed var(--border-2)",
        borderRadius: "var(--radius-md)",
        background: compact ? "transparent" : "var(--surface-2)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--surface-3)",
          color: "var(--text-3)",
        }}
      >
        {icon ?? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        )}
      </span>

      <span style={{ fontFamily: "var(--font-body)", fontSize: 14.5, fontWeight: 600, color: "var(--text-1)" }}>
        {title}
      </span>

      {body && (
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-2)",
            lineHeight: 1.55,
            maxWidth: 380,
          }}
        >
          {body}
        </span>
      )}

      {action && (
        <Link href={action.href} className="btn" style={{ textDecoration: "none", marginTop: 4 }}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
