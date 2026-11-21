"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NavBadge } from "@/components/NavBadge";

// In the order a client uses them. Videos — the thing they are paying
// for — comes straight after the overview and is drawn as a filled
// tab so it cannot be missed. Then when things happen, what the plan
// is, and where they stand. The supporting pages follow.
//
// /app/portal/plan and /app/portal/uploads keep their paths although
// the labels changed: renaming the URL would break links already sent.
const LINKS = [
  { href: "/app/portal", label: "Overview" },
  { href: "/app/portal/videos", label: "▶ Videos", feature: true },
  { href: "/app/portal/calendar", label: "Calendar" },
  { href: "/app/portal/plan", label: "Content Plan" },
  // Results sit right beside the plan: what we're making, then how
  // it's doing.
  { href: "/app/portal/content", label: "Content Hub" },
  { href: "/app/portal/account", label: "Account" },
  { href: "/app/portal/messages", label: "Messages" },
  { href: "/app/portal/uploads", label: "Files" },
  { href: "/app/portal/logins", label: "Logins" },
  { href: "/app/portal/todo", label: "To-do" },
  { href: "/app/portal/notes", label: "Notes" },
] as { href: string; label: string; feature?: boolean }[];

// Phase 9: the top-level AppNav (Phase 7) only ever shows the client
// role a single "Your Project" link — this is the second-level nav
// *inside* that section, for the five portal pages this phase builds.
// A client component (unlike AppNav) because it needs usePathname to
// highlight the active tab; nothing here is a permission boundary —
// middleware.ts's "/app/portal" prefix and each page's own RLS-backed
// query are what actually restrict this section to the client role.
export function PortalNav({ hidden = [] }: { hidden?: string[] }) {
  const pathname = usePathname();
  const strip = useRef<HTMLElement>(null);

  // Keep the tab you are on in view. Eight tabs do not fit across a
  // phone, so Messages and To-do sit off the right-hand edge — without
  // this, opening one of them leaves the underline somewhere the
  // client cannot see. Mirrors AppNav; scrollLeft rather than
  // scrollIntoView for the same reason given there.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;

    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!current) return;

    const target = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [pathname]);

  return (
    <nav
      ref={strip}
      style={{
        display: "flex",
        gap: 4,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        overflowX: "auto",
      }}
    >
      {LINKS.filter((link) => !hidden.includes(link.href)).map((link) => {
        const active = link.href === "/app/portal" ? pathname === link.href : pathname?.startsWith(link.href) ?? false;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={link.feature ? "nav-feature" : "nav-tab"}
            data-active={active ? "true" : undefined}
            data-tour-nav={link.href}
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
