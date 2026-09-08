"use client";

import { useState, type ReactNode } from "react";

/**
 * Two sections on the Messages page: the client-by-client threads,
 * and one-to-one team messaging.
 *
 * A plain client-side tab switch rather than routes, so moving
 * between them doesn't re-fetch either side.
 */
export function MessagesTabs({
  clientsLabel,
  clients,
  team,
  clientsBadge = 0,
  teamBadge = 0,
}: {
  clientsLabel: string;
  clients: ReactNode;
  team: ReactNode;
  clientsBadge?: number;
  teamBadge?: number;
}) {
  const [tab, setTab] = useState<"clients" | "team">("clients");

  return (
    <div>
      <div
        role="tablist"
        style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid var(--border)" }}
      >
        <TabButton
          active={tab === "clients"}
          badge={clientsBadge}
          onClick={() => setTab("clients")}
          label={clientsLabel}
        />
        <TabButton active={tab === "team"} badge={teamBadge} onClick={() => setTab("team")} label="Team" />
      </div>

      {/* Both stay mounted: switching tabs shouldn't throw away an
          open conversation or a half-typed message. */}
      <div hidden={tab !== "clients"}>{clients}</div>
      <div hidden={tab !== "team"}>{team}</div>
    </div>
  );
}

function TabButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--text-1)" : "transparent"}`,
        color: active ? "var(--text-1)" : "var(--text-3)",
        padding: "10px 4px",
        cursor: "pointer",
        marginRight: 16,
      }}
    >
      {label}
      {badge > 0 && (
        <span
          style={{
            fontSize: 10,
            color: "var(--bg)",
            background: "var(--text-1)",
            borderRadius: 20,
            padding: "1px 6px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
