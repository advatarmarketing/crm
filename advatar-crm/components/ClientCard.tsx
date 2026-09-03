import Link from "next/link";
import { StatusChip } from "./StatusChip";

export function ClientCard({
  id,
  name,
  service,
  stage,
  nextAction,
  avatarUrl,
  monthlyValue,
  hrefBase = "/app/clients",
}: {
  id: string;
  name: string;
  service: string | null;
  stage: string;
  nextAction: string | null;
  avatarUrl: string | null;
  /**
   * Pass this only when it was actually returned by a query against
   * client_finance — that table is ceo-only under RLS (Phase 4), so a
   * staff/videographer render simply never has a value to pass here.
   * There is no `role === 'ceo'` check in this component; the £ row
   * just doesn't exist unless the data came back.
   */
  monthlyValue?: number | null;
  /**
   * Phase 7: /app/my-clients (videographer) reuses this card but
   * needs to link into /app/my-clients/[id] instead of /app/clients/[id]
   * — the latter is outside a videographer's ALLOWED_PREFIXES in
   * middleware.ts and would just bounce them back to their own home.
   */
  hrefBase?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <Link
      href={`${hrefBase}/${id}`}
      style={{
        display: "block",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 18,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            flexShrink: 0,
            background: avatarUrl ? `center/cover no-repeat url(${avatarUrl})` : "var(--surface-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 18,
            color: "var(--text-2)",
          }}
        >
          {!avatarUrl && initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 15,
              color: "var(--text-1)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </div>
          {service && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
              {service}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <StatusChip stage={stage} />
        {typeof monthlyValue === "number" && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-1)" }}>
            £{monthlyValue.toLocaleString()}
          </span>
        )}
      </div>

      {nextAction && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--text-2)",
            lineHeight: 1.4,
          }}
        >
          {nextAction}
        </p>
      )}
    </Link>
  );
}
