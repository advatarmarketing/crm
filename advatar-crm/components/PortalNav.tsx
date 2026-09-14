"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavBadge } from "@/components/NavBadge";

// Documents deliberately sits AFTER Content Plan: the plan is the
// thing a client comes here to read, documents are the supporting
// files behind it.
//
// The /app/portal/plan route keeps its path even though the label is
// now "Content Plan" — renaming the URL would break any link already
// sent to a client, and the path isn't shown anywhere in the UI.
//
// Uploads sits directly after the plan and before Documents: it is
// where the work itself arrives, so it belongs next to the thing that
// promised it rather than among the supporting files.
const LINKS = [
  { href: "/app/portal", label: "Overview" },
  { href: "/app/portal/content", label: "Content Hub" },
  { href: "/app/portal/plan", label: "Content Plan" },
  { href: "/app/portal/uploads", label: "Uploads" },
  { href: "/app/portal/documents", label: "Documents" },
  { href: "/app/portal/calendar", label: "Calendar" },
  { href: "/app/portal/todo", label: "To-do" },
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
        padding: "0 16px",
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
              display: "inline-flex",
              alignItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              textDecoration: "none",
              whiteSpace: "nowrap",
              color: active ? "var(--text-1)" : "var(--text-3)",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              padding: "15px 13px",
              transition: "color 0.15s ease, border-color 0.15s ease",
            }}
          >
            {link.label}
            {/* Counts unread notifications pointing at this tab —
                a shared video, new material, a reply. Renders nothing
                when there is nothing waiting, which is why it can go
                on every tab rather than a chosen few. */}
            <NavBadge prefix={link.href} />
          </Link>
        );
      })}
    </nav>
  );
}
