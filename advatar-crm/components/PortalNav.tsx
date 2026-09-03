"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app/portal", label: "Overview" },
  { href: "/app/portal/content", label: "Content Hub" },
  { href: "/app/portal/documents", label: "Documents" },
  { href: "/app/portal/plan", label: "90-Day Plan" },
  { href: "/app/portal/messages", label: "Messages" },
] as const;

// Phase 9: the top-level AppNav (Phase 7) only ever shows the client
// role a single "Your Project" link — this is the second-level nav
// *inside* that section, for the five portal pages this phase builds.
// A client component (unlike AppNav) because it needs usePathname to
// highlight the active tab; nothing here is a permission boundary —
// middleware.ts's "/app/portal" prefix and each page's own RLS-backed
// query are what actually restrict this section to the client role.
export function PortalNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        padding: "0 32px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        overflowX: "auto",
      }}
    >
      {LINKS.map((link) => {
        const active = link.href === "/app/portal" ? pathname === link.href : pathname?.startsWith(link.href) ?? false;
        return (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              textDecoration: "none",
              whiteSpace: "nowrap",
              color: active ? "var(--text-1)" : "var(--text-3)",
              borderBottom: active ? "2px solid var(--text-1)" : "2px solid transparent",
              padding: "14px 12px",
            }}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
