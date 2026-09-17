"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * What anyone sees when a page under /app throws.
 *
 * Without this, Next serves its own bare screen: a black page reading
 * "Application error: a server-side exception has occurred" and a
 * digest number. That tells the person nothing they can act on, gives
 * them no way back, and tells whoever is fixing it only that something
 * somewhere broke.
 *
 * This keeps the digest — it is the key to finding the real stack in
 * the Vercel logs — but puts it next to a plain explanation, the page
 * it happened on, and two ways out. The error itself is still logged
 * to the console, where the browser's own tooling can reach it.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server exceptions arrive here with their message stripped, so
    // this mostly matters for client-side throws — where it is the
    // difference between a stack and a shrug.
    console.error("[app] page error", error);
  }, [error]);

  return (
    <main className="page page-xs" style={{ paddingTop: 64 }}>
      <h1 className="page-title page-title-accent">That page didn&rsquo;t load</h1>

      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14.5,
          color: "var(--text-2)",
          lineHeight: 1.65,
          margin: "24px 0 0",
          maxWidth: "58ch",
        }}
      >
        Something went wrong on our side, not yours — nothing you did caused
        this and nothing has been lost. Try again, and if it keeps happening
        send whoever looks after the CRM the reference below.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "28px 0 0" }}>
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/app" className="btn" style={{ textDecoration: "none" }}>
          Back to your dashboard
        </Link>
      </div>

      {error.digest && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.04em",
            color: "var(--text-3)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            margin: "28px 0 0",
            display: "inline-block",
          }}
        >
          Reference: {error.digest}
        </p>
      )}
    </main>
  );
}
