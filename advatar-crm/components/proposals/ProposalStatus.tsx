"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PIcon } from "./PIcon";

/** The short pages a proposal link shows when it isn't the slideshow. */
export function ProposalStatus({
  kind,
  business,
  email,
  method,
  code,
  newCode,
}: {
  kind: "missing" | "paid" | "confirming" | "updated" | "not-ready";
  business?: string;
  email?: string | null;
  method?: "card" | "cash" | null;
  code?: string;
  newCode?: string;
}) {
  const router = useRouter();
  // Waiting for Stripe to tell us the payment went through.
  useEffect(() => {
    if (kind !== "confirming") return;
    let n = 0;
    const iv = window.setInterval(() => {
      n++;
      if (n > 40) return window.clearInterval(iv);
      router.refresh();
    }, 3000);
    return () => window.clearInterval(iv);
  }, [kind, router]);

  const copy = {
    missing: { title: "This link doesn't work", body: "Check you have the whole link, or ask us for a new one." },
    paid: {
      title: "You're in!",
      body: `${method === "cash" ? "Your cash payment has been noted" : "Payment received"}. Welcome to Advatar${business ? `, ${business}` : ""}. ${
        email ? `Your login details are on their way to ${email}. ` : ""
      }We'll be in touch shortly to book your first shoot.`,
    },
    confirming: { title: "Confirming your payment…", body: "This only takes a moment. You can keep this page open." },
    updated: { title: "This proposal has been updated", body: newCode ? "We've made you a new version. Open it below." : "We're preparing a new version for you and will send it shortly." },
    "not-ready": { title: "Your proposal isn't ready yet", body: "We're putting the finishing touches to it. We'll send you the link when it's ready." },
  }[kind];

  return (
    <div className="pp" data-stage="status">
      <div className="pp-orb pp-orb-a" aria-hidden="true" />
      <div className="pp-orb pp-orb-b" aria-hidden="true" />
      <header className="pp-top">
        <span className="pp-brand">ADVATAR</span>
      </header>
      <main className="pp-stage pp-step">
        <div className="pp-slide pp-narrow">
          {(kind === "paid" || kind === "confirming") && (
            <span className="pp-done-mark pp-in" style={{ ["--d" as string]: 0 }} aria-hidden="true">
              <PIcon name={kind === "paid" ? "check" : "clock"} size={28} />
            </span>
          )}
          <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
            {copy.title}
          </h1>
          <p className="pp-sub pp-in" style={{ ["--d" as string]: 2 }}>
            {copy.body}
          </p>
          {kind === "updated" && newCode && (
            <a className="pp-go pp-in" style={{ ["--d" as string]: 3, textDecoration: "none", marginTop: 18 }} href={`/proposal/${newCode}`}>
              Open the new proposal
            </a>
          )}
          {kind === "paid" && code && (
            <p className="pp-fine pp-in" style={{ ["--d" as string]: 3 }}>
              <a href={`/proposal/${code}/invoice`}>Your invoice</a> · <a href={`/proposal/${code}/contract`}>Your contract</a> · <a href="/login">Sign in</a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
