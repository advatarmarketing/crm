"use client";

import { useState, type ReactNode } from "react";

export interface SectionTab {
  key: string;
  label: string;
  badge?: number;
  /** Shown under the tab row — says who can read what's in here. */
  blurb?: string;
  content: ReactNode;
}

/**
 * A row of tabs over panes that are all rendered up front.
 *
 * Started life on the Messages page as a fixed Clients/Team pair, then
 * had to vary by role (Work Chat and Admin for a videographer), and is
 * now also the Guidelines/Resources switch on Tools. The set of tabs
 * is decided by the page, which knows the role; this only renders it.
 *
 * A plain client-side switch rather than routes, and every pane stays
 * mounted, so moving between them doesn't re-fetch a conversation or
 * throw away a half-typed message.
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.key}
            active={tab.key === active}
            badge={tab.badge ?? 0}
            onClick={() => setActive(tab.key)}
            label={tab.label}
          />
        ))}
      </div>

      {/* Who can read this. Worth a permanent line rather than a
          tooltip: the cost of guessing wrong about which of these a
          client can see is somebody's working relationship. */}
      {current?.blurb && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-3)", margin: "0 0 20px", maxWidth: "62ch" }}>
          {current.blurb}
        </p>
      )}

      {tabs.map((tab) => (
        <div key={tab.key} hidden={tab.key !== active}>
          {tab.content}
        </div>
      ))}
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
