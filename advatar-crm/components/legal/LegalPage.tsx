import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame for the public Privacy Policy and Terms pages.
 *
 * These are linked from Meta's and TikTok's app settings, so they have
 * to open for anyone without signing in. middleware.ts only guards "/",
 * "/login" and "/app/*", so /privacy and /terms are public already.
 * They are plain server-rendered text: no forms, no scripts of their
 * own and nothing read from the database.
 */
export function LegalPage({
  title,
  updated,
  other,
  children,
}: {
  title: string;
  updated: string;
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <Link href="/" className="legal-brand">
          Advatar
        </Link>
        <Link href={other.href} className="legal-switch">
          {other.label}
        </Link>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {updated}</p>
        {children}
      </article>
    </main>
  );
}
