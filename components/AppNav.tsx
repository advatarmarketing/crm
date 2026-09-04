import Link from "next/link";
import type { ProfileRole } from "@/lib/supabase/types";
import { signOutAction } from "@/app/app/actions";
import { MessagesNavBadge } from "@/components/MessagesNavBadge";

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
  // Phase 10: "Messages" added here and to staff below — neither role
  // had a way to reach the chat UI from the nav before this (it was
  // reachable by URL only, via the "/app" catch-all). ceo isn't named
  // explicitly in this phase's brief ("staff/ceo" for the page itself,
  // but only "staff"/"videographer" for the nav badge) — added anyway
  // since ceo and staff have shared every other nav item and page in
  // this app so far, and having ceo able to reach the chat page from
  // nowhere but a typed URL would be an inconsistent exception.
  ceo: [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/clients", label: "Clients" },
    { href: "/app/leads", label: "Leads" },
    { href: "/app/prospects", label: "Prospects" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/payments", label: "Payments" },
    { href: "/app/settings/team", label: "Team" },
  ],
  // New role (Phase 12): runs sales/strategy alongside the CEO, so it
  // shares the CEO's nav minus the two purely-financial items
  // (Payments, and Team since inviting logins is kept CEO-only) —
  // see 0010_ops_manager_leads_staff_scoping.sql for why this role
  // has no invoices/client_finance/payments access.
  operations_manager: [
    { href: "/app/dashboard", label: "Dashboard" },
    { href: "/app/clients", label: "Clients" },
    { href: "/app/leads", label: "Leads" },
    { href: "/app/prospects", label: "Prospects" },
    { href: "/app/messages", label: "Messages" },
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
    { href: "/app/messages", label: "Messages" },
    { href: "/app/my-payments", label: "My Payments" },
  ],
  videographer: [
    { href: "/app/my-clients", label: "My Clients" },
    { href: "/app/messages", label: "Messages" },
    { href: "/app/my-payments", label: "My Payments" },
  ],
  client: [{ href: "/app/portal", label: "Your Project" }],
};

export function AppNav({ role }: { role: ProfileRole }) {
  const links = NAV_BY_ROLE[role];

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 20,
            letterSpacing: "0.02em",
            color: "var(--text-1)",
            marginRight: 20,
          }}
        >
          ADVATAR
        </span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-2)",
              textDecoration: "none",
              padding: "16px 12px",
            }}
          >
            {link.label}
            {link.href === "/app/messages" && <MessagesNavBadge />}
          </Link>
        ))}
      </div>

      <form action={signOutAction}>
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
            padding: "8px 0",
          }}
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
