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
import { NotificationBell, type AppNotification } from "@/components/NotificationBell";
import { NavIcon, type NavIconName } from "@/components/NavIcon";

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
const NAV_BY_ROLE: Record<ProfileRole, { href: string; label: string; icon: NavIconName }[]> = {
  ceo: [
    { href: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/app/calendar", label: "Calendar", icon: "calendar" },
    { href: "/app/todo", label: "To-do", icon: "todo" },
    { href: "/app/clients", label: "Clients", icon: "clients" },
    { href: "/app/videographers", label: "Videographers", icon: "videographers" },
    { href: "/app/leads", label: "Leads", icon: "leads" },
    { href: "/app/prospects", label: "Prospects", icon: "prospects" },
    { href: "/app/finance", label: "Finance", icon: "finance" },
    { href: "/app/summary", label: "This week", icon: "week" },
    { href: "/app/tools", label: "Tools", icon: "tools" },
    { href: "/app/messages", label: "Messages", icon: "messages" },
    { href: "/app/payments", label: "Payments", icon: "payments" },
    { href: "/app/settings/logins", label: "Logins", icon: "logins" },
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
    { href: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/app/calendar", label: "Calendar", icon: "calendar" },
    { href: "/app/todo", label: "To-do", icon: "todo" },
    { href: "/app/clients", label: "Clients", icon: "clients" },
    { href: "/app/videographers", label: "Videographers", icon: "videographers" },
    { href: "/app/leads", label: "Leads", icon: "leads" },
    { href: "/app/prospects", label: "Prospects", icon: "prospects" },
    { href: "/app/finance", label: "Finance", icon: "finance" },
    { href: "/app/summary", label: "This week", icon: "week" },
    { href: "/app/tools", label: "Tools", icon: "tools" },
    { href: "/app/messages", label: "Messages", icon: "messages" },
    { href: "/app/settings/logins", label: "Logins", icon: "logins" },
  ],
  // Phase 12: staff's RLS is now scoped to only its assigned clients
  // (0010_ops_manager_leads_staff_scoping.sql) — this nav is unchanged
  // on purpose, since the page itself naturally comes back empty/
  // filtered for anything staff isn't assigned to, same pattern this
  // app already uses for videographer's "My Clients". "Prospects" was
  // dropped from staff's nav because fathom_calls moved to
  // management-only in that same migration.
  staff: [
    { href: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/app/calendar", label: "Calendar", icon: "calendar" },
    { href: "/app/todo", label: "To-do", icon: "todo" },
    { href: "/app/clients", label: "Clients", icon: "clients" },
    { href: "/app/leads", label: "Leads", icon: "leads" },
    { href: "/app/tools", label: "Tools", icon: "tools" },
    { href: "/app/messages", label: "Messages", icon: "messages" },
    { href: "/app/my-payments", label: "My Payments", icon: "payments" },
  ],
  // Phase 20: their own dashboard is now the landing page after
  // signing in (see HOME_BY_ROLE in middleware.ts), with the calendar
  // beside it.
  videographer: [
    { href: "/app/my-dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/app/calendar", label: "Calendar", icon: "calendar" },
    { href: "/app/todo", label: "To-do", icon: "todo" },
    { href: "/app/my-work", label: "My Work", icon: "work" },
    { href: "/app/my-clients", label: "My Clients", icon: "clients" },
    { href: "/app/tools", label: "Tools", icon: "tools" },
    { href: "/app/my-portfolio", label: "Portfolio", icon: "portfolio" },
    { href: "/app/messages", label: "Messages", icon: "messages" },
    { href: "/app/my-payments", label: "My Payments", icon: "payments" },
  ],
  // The client's tabs live in PortalNav instead — Overview, Content
  // Hub, Content Plan, Documents, Calendar, To-do, Messages — so this
  // is only what the burger menu needs on a phone. The strip below is
  // hidden for them rather than repeating a single "Your Project"
  // above the portal's own row.
  client: [{ href: "/app/portal", label: "Your Project", icon: "portal" }],
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
export function AppNav({ role, notifications = [] }: { role: ProfileRole; notifications?: AppNotification[] }) {
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

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}>
          {role !== "client" && <QuickSearch />}
          {/* Every role gets the bell: clients are told when work is
              shared with them, staff when they are given a client or a
              task. It sits outside .nav-links so it stays visible on a
              phone, where the link row collapses into the burger. */}
          <NotificationBell initial={notifications} />
          <ThemeToggle />

          {/* Every role, including videographer and client: logins are
              handed over with a temporary password, so everyone needs
              somewhere to change it. Kept out of the main link row so
              it doesn't take space from the pages people actually
              navigate between. */}
          <Link
            href="/app/settings/profile"
            className="nav-links"
            title="Your name, phone and photo"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: isActive("/app/settings/profile") ? "var(--text-1)" : "var(--text-3)",
              textDecoration: "none",
              padding: "8px 4px",
              whiteSpace: "nowrap",
            }}
          >
            Profile
          </Link>

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

      {/* The tab strip, on its own row — the same shape the client
          portal has always had (components/PortalNav.tsx), now used by
          every staff-side login too.

          Giving the tabs a row of their own is most of what made the
          portal feel more finished: before this they were wedged
          between the logo and the sign-out controls, so on the CEO's
          twelve-item nav they scrolled inside a few hundred pixels and
          the active tab was often off-screen. A full-width row fits
          them, and the underline lines up with the bar's own bottom
          edge instead of floating inside it.

          Still `.nav-links`, so it disappears under 900px exactly as
          before and the burger takes over unchanged. */}
      {role !== "client" && (
      <div
        className="nav-links"
        style={{
          gap: 4,
          padding: "0 16px",
          borderTop: "1px solid var(--border)",
          marginBottom: -1,
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                textDecoration: "none",
                whiteSpace: "nowrap",
                // Inactive tabs drop to --text-3 rather than --text-2:
                // the portal's contrast step is what makes the current
                // tab read as selected at a glance.
                color: active ? "var(--text-1)" : "var(--text-3)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                padding: "15px 13px",
                transition: "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {link.label}
              {link.href === "/app/messages" && <MessagesNavBadge />}
            </Link>
          );
        })}
      </div>
      )}

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
            <Link key={link.href} href={link.href} style={menuRow(isActive(link.href))}>
              {/* The icon inherits currentColor, so it dims and lifts
                  with its label rather than sitting at a fixed grey
                  while the text changes around it. */}
              <NavIcon name={link.icon} />
              {link.label}
              {link.href === "/app/messages" && <MessagesNavBadge />}
            </Link>
          ))}

          <Link href="/app/settings/profile" style={menuRow(isActive("/app/settings/profile"))}>
            <NavIcon name="profile" />
            Profile
          </Link>

          <Link href="/app/settings/password" style={menuRow(isActive("/app/settings/password"))}>
            <NavIcon name="password" />
            Password
          </Link>

          <form action={signOutAction}>
            <button
              type="submit"
              style={{
                ...menuRow(false),
                color: "var(--text-3)",
                background: "none",
                border: "none",
                borderBottom: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
              <NavIcon name="signout" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}

/**
 * One row of the phone menu.
 *
 * Extracted because the same eleven declarations were repeated four
 * times, and adding an icon to each meant getting the gap and the
 * alignment right four times over. `gap` is what makes the icons line
 * up into a column down the left of the menu rather than each sitting
 * an arbitrary distance from its own label.
 */
function menuRow(active: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 13,
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: active ? "var(--text-1)" : "var(--text-2)",
    textDecoration: "none",
    padding: "14px 4px",
    minHeight: 48,
    borderBottom: "1px solid var(--border)",
  };
}
