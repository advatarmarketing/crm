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
  name: string | null;
  service: string | null;
  stage: string | null;
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
  // Defensive: a null name here is a server-side crash that takes
  // the whole page down (see the note in app/app/my-clients/page.tsx).
  const safeName = name?.trim() || "Untitled client";
  const initial = safeName.charAt(0).toUpperCase() || "?";

  return (
    <Link href={`${hrefBase}/${id}`} className="card card-link card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div
          aria-hidden="true"
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            flexShrink: 0,
            background: avatarUrl ? `center/cover no-repeat url(${avatarUrl})` : "var(--surface-3)",
            border: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 19,
            color: "var(--text-2)",
          }}
        >
          {!avatarUrl && initial}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 15.5,
              color: "var(--text-1)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {safeName}
          </div>
          {service && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--text-3)",
                marginTop: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {service}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <StatusChip stage={stage ?? "lead"} />
        {typeof monthlyValue === "number" && (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              letterSpacing: "0.01em",
              color: "var(--text-1)",
              lineHeight: 1,
            }}
          >
            £{monthlyValue.toLocaleString()}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>/mo</span>
          </span>
        )}
      </div>

      {nextAction && (
        <p
          style={{
            margin: 0,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          {nextAction}
        </p>
      )}
    </Link>
  );
}
