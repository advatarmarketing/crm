"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProfileRole } from "@/lib/supabase/types";
import { signOutAction } from "@/app/app/actions";
import { MessagesNavBadge } from "@/components/MessagesNavBadge";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QuickSearch } from "@/components/QuickSearch";

/**
 * Phase 7: the nav's content per role is a presentation choice layered
 * on top of enforcement that already exists elsewhere — middleware.ts
 * (ALLOWED_PREFIXES) blocks a videographer from ever loading
 * /app/clients or /app/dashboard regardless of what this component
 * renders, and RLS blocks the underlying data regardless of the
 * route. This map exists so a videographer never even SEES "All
 * Clients"/"Prospects"/"Team" as options, not because those links
 * would work if clicked (they wouldn't) but because a menu item that
 * always 404s or bounces you elsewhere is bad UX, not a security
 * feature.
 */
const NAV_BY_ROLE: Record<ProfileRole, { href: string; label: string }[]> = {
  ceo: [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/clients", label: "Clients" },
    { href: "/app/videographers", label: "Videographers" },
    { href: "/app/leads", label: "Leads" },
    { href: "/app/prospects", label: "Prospects" },
    { href: "/app/finance", label: "Finance" },
    { href: "/app/summary", label: "This week" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/payments", label: "Payments" },
    { href: "/app/settings/logins", label: "Logins" },
  ],
  // Phase 12/14: runs sales and strategy alongside the CEO, so it gets
  // the CEO's nav minus "Payments" (what staff are paid) and "Team"
  // (inviting logins stays CEO-only). It DOES get Finance: raising and
  // chasing invoices for work you sold is part of the job. What it
  // still cannot see is each client's monthly recurring value
  // (client_finance) or anyone's wages — both remain CEO-only at the
  // database level. See 0011_invoices_finance.sql.
  // Phase 19: gains Videographers (the admin-side team view) and
  // Logins. Creating logins is no longer CEO-only, but what an
  // operations manager may create is narrower — staff, videographers
  // and clients, never another manager or a CEO. That limit lives in
  // settings/logins/actions.ts, not here.
  operations_manager: [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/clients", label: "Clients" },
    { href: "/app/videographers", label: "Videographers" },
    { href: "/app/leads", label: "Leads" },
    { href: "/app/prospects", label: "Prospects" },
    { href: "/app/finance", label: "Finance" },
    { href: "/app/summary", label: "This week" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/settings/logins", label: "Logins" },
  ],
  // Phase 12: staff's RLS is now scoped to only its assigned clients
  // (0010_ops_manager_leads_staff_scoping.sql) — this nav is unchanged
  // on purpose, since the page itself naturally comes back empty/
  // filtered for anything staff isn't assigned to, same pattern this
  // app already uses for videographer's "My Clients". "Prospects" was
  // dropped from staff's nav because fathom_calls moved to
  // management-only in that same migration.
  staff: [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/clients", label: "Clients" },
    { href: "/app/leads", label: "Leads" },
    { href: "/app/guidelines", label: "Guidelines" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/my-payments", label: "My Payments" },
  ],
  // Phase 20: their own dashboard is now the landing page after
  // signing in (see HOME_BY_ROLE in middleware.ts), with the calendar
  // beside it.
  videographer: [
    { href: "/app/my-dashboard", label: "Dashboard" },
    { href: "/app/my-calendar", label: "Calendar" },
    { href: "/app/my-work", label: "My Work" },
    { href: "/app/my-clients", label: "My Clients" },
    { href: "/app/guidelines", label: "Guidelines" },
    { href: "/app/my-portfolio", label: "Portfolio" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/my-payments", label: "My Payments" },
  ],
  client: [{ href: "/app/portal", label: "Your Project" }],
};

/**
 * Phase 13: rebuilt as a client component so it can (a) highlight the
 * page you're actually on and (b) collapse into a menu on a phone.
 * Before this the links sat in one un-wrapping row, which on a narrow
 * screen pushed "Sign out" off the edge and made half the app
 * unreachable from a phone.
 *
 * `signOutAction` is a server action imported into a client component,
 * which is supported — the function isn't bundled to the browser, only
 * a reference to it is, and it still executes on the server.
 */
export function AppNav({ role }: { role: ProfileRole }) {
  const links = NAV_BY_ROLE[role];
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu on navigation — without this, tapping a link
  // leaves the panel sitting open over the page you just moved to.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (!pathname) return false;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 16px",
          minHeight: 56,
        }}
      >
        <Link
          href={links[0]?.href ?? "/app"}
          style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", marginRight: 8 }}
        >
          <Logo />
        </Link>

        {/* Desktop links. Hidden under 900px, where the button below
            takes over — the breakpoint is where this row starts
            colliding with the sign-out control on the CEO's seven-item
            nav, not an arbitrary device width. */}
        {/* overflowX: the CEO's nav is ten items now, which between
            900px and roughly 1400px is wider than the space left
            beside the sign-out controls. Scrolling here keeps every
            link reachable instead of pushing the last ones off the
            edge. */}
        <div
          className="nav-links"
          style={{
            alignItems: "center",
            gap: 2,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: isActive(link.href) ? "var(--text-1)" : "var(--text-2)",
                textDecoration: "none",
                padding: "18px 10px",
                whiteSpace: "nowrap",
                borderBottom: isActive(link.href) ? "2px solid var(--text-1)" : "2px solid transparent",
              }}
            >
              {link.label}
              {link.href === "/app/messages" && <MessagesNavBadge />}
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {role !== "client" && <QuickSearch />}
          <ThemeToggle />

          {/* Every role, including videographer and client: logins are
              handed over with a temporary password, so everyone needs
              somewhere to change it. Kept out of the main link row so
              it doesn't take space from the pages people actually
              navigate between. */}
          <Link
            href="/app/settings/password"
            className="nav-links"
            title="Change your password"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: isActive("/app/settings/password") ? "var(--text-1)" : "var(--text-3)",
              textDecoration: "none",
              padding: "8px 4px",
              whiteSpace: "nowrap",
            }}
          >
            Password
          </Link>

          <form action={signOutAction} className="nav-links">
            <button
              type="submit"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                background: "none",
                border: "none",
                color: "var(--text-3)",
                cursor: "pointer",
                padding: "8px 4px",
                minHeight: 44,
              }}
            >
              Sign out
            </button>
          </form>

          <button
            type="button"
            className="nav-burger"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-1)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          className="nav-panel"
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "8px 16px 16px",
          }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                alignItems: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: isActive(link.href) ? "var(--text-1)" : "var(--text-2)",
                textDecoration: "none",
                padding: "14px 4px",
                minHeight: 48,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {link.label}
              {link.href === "/app/messages" && <MessagesNavBadge />}
            </Link>
          ))}

          <Link
            href="/app/settings/password"
            style={{
              display: "flex",
              alignItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: isActive("/app/settings/password") ? "var(--text-1)" : "var(--text-2)",
              textDecoration: "none",
              padding: "14px 4px",
              minHeight: 48,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Password
          </Link>

          <form action={signOutAction}>
            <button
              type="submit"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                background: "none",
                border: "none",
                color: "var(--text-3)",
                cursor: "pointer",
                padding: "14px 4px",
                minHeight: 48,
                width: "100%",
                textAlign: "left",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}
