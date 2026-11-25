"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GROUPS, type Choice, type Media, type PackageId, type ProposalContent, type Slide } from "@/lib/proposals/content";
import { cleanChoice, contractText, enabledPackages, extraKey, linePrice, money, priceSlide, slidesFor, totals } from "@/lib/proposals/pricing";
import { acceptAction, cardAction, cashAction } from "@/app/proposal/[code]/actions";
import { PIcon } from "./PIcon";

/**
 * The client's proposal (0057): an animated slideshow in the style of
 * the client welcome. Packages first (visuals, no prices), then each
 * topic and priced item in order, then the summary with "Let's go",
 * the contract and payment.
 *
 * mode "preview" is the team's look at exactly the same thing: nothing
 * is tracked and nothing is saved or charged.
 */

type Stage = "show" | "email" | "method" | "cash";
type Who = { business: string; contact: string | null; email: string | null };

type Ev = { kind: string; slide?: string | null; package?: string | null; ms?: number | null; detail?: Record<string, string | number | boolean | null> | null };

function isVideo(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || /\/video\/upload\//.test(url);
}

function MediaBox({ m, preview, className = "" }: { m: Media; preview: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <figure
      className={`pp-media ${className}`}
      data-open={open ? "true" : undefined}
      onClick={() => setOpen((o) => !o)}
      onMouseLeave={() => setOpen(false)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      {m.url ? (
        isVideo(m.url) ? (
          <video src={m.url} autoPlay muted loop playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url} alt={m.caption} loading="lazy" />
        )
      ) : (
        <div className="pp-ph" aria-hidden="true">
          <PIcon name="camera" size={26} />
          {preview && <span>Add a Cloudinary link</span>}
        </div>
      )}
      {m.caption && <figcaption>{m.caption}</figcaption>}
    </figure>
  );
}

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {back ? <path d="M19 12H5M11 6l-6 6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
    </svg>
  );
}

/** "2 shoots", "8 videos": the headline quantity of a slide, without prices. */
function amountLabel(s: Slide, pkg: PackageId): string | null {
  const l = s.lines.find((x) => (x.qty[pkg] ?? 0) > 0);
  if (!l) return null;
  const n = l.qty[pkg];
  if (l.unitLabel === "hour") {
    const hrs = s.lines.reduce((a, x) => a + (x.unitLabel === "hour" ? x.qty[pkg] ?? 0 : 0), 0);
    return `${hrs} hrs a month`;
  }
  return `${n} ${n === 1 ? l.unitLabel : l.unitLabel.replace(/s$/, "") + "s"} a month`;
}

export function ProposalShow({
  content,
  code,
  mode,
  who,
  cardOn,
  initialChoice,
  initialStage = "show",
  invoiceNumber: initialInvoice = null,
  amount: initialAmount = null,
  closeHref,
}: {
  content: ProposalContent;
  code: string | null;
  mode: "live" | "preview";
  who: Who;
  cardOn: boolean;
  initialChoice?: Choice | null;
  initialStage?: Stage;
  invoiceNumber?: string | null;
  amount?: number | null;
  closeHref?: string;
}) {
  const preview = mode === "preview" || !code;
  const start = useMemo(() => cleanChoice(content, initialChoice ?? undefined), [content, initialChoice]);
  const [pkg, setPkg] = useState<PackageId>(start.package);
  const [plan, setPlan] = useState<Choice["plan"]>(start.plan);
  const [extras, setExtras] = useState<Record<string, number>>(start.extras);
  const choice = useMemo(() => cleanChoice(content, { package: pkg, plan, extras }), [content, pkg, plan, extras]);
  const t = useMemo(() => totals(content, choice), [content, choice]);
  const pkgs = enabledPackages(content);

  const slides = useMemo(() => slidesFor(content, pkg), [content, pkg]);
  const steps = useMemo(() => ["packages", ...slides.map((s) => s.id), "summary"], [slides]);
  const [stepId, setStepId] = useState("packages");
  const index = Math.max(0, steps.indexOf(stepId));
  const [stage, setStage] = useState<Stage>(initialStage);
  const [contractOpen, setContractOpen] = useState(false);
  const [openTab, setOpenTab] = useState<string | null>(null);

  // Which pages they've seen. "Let's go" opens once every page of the
  // chosen package has been seen. Kept per link, across visits.
  const seenKey = code ? `pp-seen-${code}` : null;
  const [seen, setSeen] = useState<Set<string>>(() => new Set(["packages"]));
  useEffect(() => {
    if (!seenKey) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(seenKey) ?? "[]");
      if (Array.isArray(saved)) setSeen((s) => new Set([...s, ...saved]));
    } catch {
      /* private window: start fresh */
    }
  }, [seenKey]);
  useEffect(() => {
    setSeen((s) => (s.has(stepId) ? s : new Set([...s, stepId])));
  }, [stepId]);
  useEffect(() => {
    if (!seenKey) return;
    try {
      window.localStorage.setItem(seenKey, JSON.stringify([...seen]));
    } catch {
      /* ignore */
    }
  }, [seen, seenKey]);
  const unseen = steps.filter((s) => s !== "summary" && !seen.has(s));
  const allSeen = unseen.length === 0;

  // ---------------------------------------------------------------
  // Tracking (live links only)
  // ---------------------------------------------------------------
  const queue = useRef<Ev[]>([]);
  const session = useRef<string>("");
  const timing = useRef<{ step: string; pkg: string; at: number } | null>(null);
  const track = useCallback(
    (e: Ev) => {
      if (preview) return;
      queue.current.push(e);
    },
    [preview]
  );
  const send = useCallback(
    (beacon: boolean) => {
      if (preview || !code || !queue.current.length) return Promise.resolve();
      const events = queue.current.splice(0, 60);
      const body = JSON.stringify({ code, session: session.current, events });
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/proposals/track", new Blob([body], { type: "application/json" }));
        return Promise.resolve();
      }
      return fetch("/api/proposals/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).then(
        () => undefined,
        () => undefined
      );
    },
    [preview, code]
  );
  const closeTiming = useCallback(() => {
    const tm = timing.current;
    if (!tm) return;
    track({ kind: "slide", slide: tm.step, package: tm.pkg, ms: Math.min(Date.now() - tm.at, 3600000), detail: { index: steps.indexOf(tm.step) } });
    timing.current = null;
  }, [track, steps]);

  useEffect(() => {
    if (preview) return;
    try {
      session.current = window.sessionStorage.getItem("pp-session") ?? "";
      if (!session.current) {
        session.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
        window.sessionStorage.setItem("pp-session", session.current);
      }
    } catch {
      session.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    const w = window.innerWidth;
    track({ kind: "open", detail: { device: w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop" } });
    send(false);
    const iv = window.setInterval(() => send(true), 4000);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        closeTiming();
        send(true);
      } else if (!timing.current) {
        timing.current = { step: stepRef.current, pkg: pkgRef.current, at: Date.now() };
      }
    };
    const onLeave = () => {
      closeTiming();
      send(true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const stepRef = useRef(stepId);
  const pkgRef = useRef<string>(pkg);
  useEffect(() => {
    stepRef.current = stepId;
    pkgRef.current = pkg;
    if (stage !== "show") return;
    closeTiming();
    timing.current = { step: stepId, pkg, at: Date.now() };
    // Arriving counts as seeing it, even if the tab is closed before they move on.
    track({ kind: "slide", slide: stepId, package: pkg, ms: 0, detail: { index: steps.indexOf(stepId) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId, pkg, stage]);

  // ---------------------------------------------------------------
  // Moving around
  // ---------------------------------------------------------------
  const go = useCallback(
    (to: number) => {
      const next = steps[Math.min(Math.max(to, 0), steps.length - 1)];
      setStepId(next);
      setOpenTab(null);
      window.scrollTo({ top: 0 });
    },
    [steps]
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const back = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    if (stage !== "show" || contractOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight" && index < steps.length - 1) next();
      else if (e.key === "ArrowLeft" && index > 0) back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, contractOpen, index, steps.length, next, back]);

  const touch = useRef<{ x: number; y: number } | null>(null);

  const pickPackage = (id: PackageId) => {
    if (id === pkg) return;
    track({ kind: "package", package: id, detail: { from: pkg } });
    setPkg(id);
  };
  // If the page they're on isn't part of the new package, go to the summary's nearest neighbour.
  useEffect(() => {
    if (!steps.includes(stepId)) setStepId(steps[Math.min(index, steps.length - 1)] ?? "packages");
  }, [steps, stepId, index]);

  const setExtra = (s: Slide, xid: string, qty: number) => {
    const x = s.extras.find((e) => e.id === xid);
    if (!x) return;
    const k = extraKey(s, x);
    const n = Math.min(Math.max(qty, 0), x.max);
    setExtras((prev) => {
      const out = { ...prev };
      if (n > 0) out[k] = n;
      else delete out[k];
      return out;
    });
    track({ kind: "extra", slide: s.id, package: pkg, detail: { extra: xid, qty: n } });
  };

  // ---------------------------------------------------------------
  // Contract, Let's go, email, payment
  // ---------------------------------------------------------------
  const contractOpenedAt = useRef(0);
  const openContract = () => {
    contractOpenedAt.current = Date.now();
    setContractOpen(true);
  };
  const closeContract = () => {
    setContractOpen(false);
    track({ kind: "contract", package: pkg, ms: Date.now() - contractOpenedAt.current });
  };

  const [email, setEmail] = useState(who.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<{ amount: number; invoiceNumber: string | null; emailed: boolean } | null>(
    initialAmount != null ? { amount: initialAmount, invoiceNumber: initialInvoice, emailed: false } : null
  );

  const letsGo = () => {
    if (!allSeen) return;
    track({ kind: "lets_go", package: pkg, detail: { plan, total: t.dueNow } });
    closeTiming();
    setError(null);
    setStage("email");
  };

  const submitEmail = async () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (preview) {
      setAccepted({ amount: t.dueNow, invoiceNumber: "ADV-PREVIEW", emailed: false });
      setStage("method");
      return;
    }
    setBusy(true);
    await send(false);
    while (queue.current.length) await send(false);
    const r = await acceptAction(code!, choice, email);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    track({ kind: "email", package: pkg });
    setAccepted({ amount: r.amount, invoiceNumber: r.invoiceNumber, emailed: r.emailed });
    setStage("method");
  };

  const payCard = async () => {
    setError(null);
    if (preview) {
      setError("Preview: card payment is switched off here.");
      return;
    }
    setBusy(true);
    track({ kind: "method", detail: { method: "card" } });
    await send(false);
    const r = await cardAction(code!);
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
      return;
    }
    window.location.assign(r.url);
  };

  const payCash = async () => {
    setError(null);
    if (preview) {
      setStage("cash");
      return;
    }
    setBusy(true);
    track({ kind: "method", detail: { method: "cash" } });
    await send(false);
    const r = await cashAction(code!);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Something went wrong.");
      return;
    }
    setStage("cash");
  };

  // ---------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------
  const current = slides.find((s) => s.id === stepId) ?? null;
  const pkgName = content.packages.find((p) => p.id === pkg)?.name ?? "";
  const firstName = who.contact?.split(/\s+/)[0] ?? null;

  return (
    <div className="pp" data-stage={stage}>
      <div className="pp-orb pp-orb-a" aria-hidden="true" />
      <div className="pp-orb pp-orb-b" aria-hidden="true" />

      <header className="pp-top">
        <span className="pp-brand">ADVATAR</span>
        {stage === "show" && stepId !== "packages" && pkgs.length > 1 && (
          <div className="pp-switch" role="group" aria-label="Package">
            {pkgs.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === pkg} onClick={() => pickPackage(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <span className="pp-for">
          {preview && <span className="pp-badge">Preview</span>}
          For {who.business}
          {closeHref && (
            <a className="pp-close" href={closeHref}>
              Close
            </a>
          )}
        </span>
      </header>

      {stage === "show" && (
        <main
          className="pp-stage"
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const s = touch.current;
            touch.current = null;
            if (!s) return;
            const dx = e.changedTouches[0].clientX - s.x;
            const dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx < 0 && index < steps.length - 1) next();
              if (dx > 0 && index > 0) back();
            }
          }}
        >
          <div className="pp-slide" key={`${stepId}`}>
            {stepId === "packages" && (
              <section className="pp-packages">
                <p className="pp-kicker pp-in" style={{ ["--d" as string]: 0 }}>
                  {firstName ? `${firstName}, ${content.intro.kicker.toLowerCase()}` : content.intro.kicker}
                </p>
                <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
                  {content.intro.title}
                </h1>
                <p className="pp-sub pp-in" style={{ ["--d" as string]: 2 }}>
                  {content.intro.subtitle}
                </p>
                <div className="pp-cards">
                  {pkgs.map((p, i) => {
                    const inside = slidesFor(content, p.id).filter((s) => s.kind === "priced");
                    const on = p.id === pkg;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="pp-card pp-in"
                        style={{ ["--d" as string]: 3 + i }}
                        aria-pressed={on}
                        onClick={() => pickPackage(p.id)}
                      >
                        {p.id === content.defaultPackage && <span className="pp-pop">Most popular</span>}
                        <span className="pp-card-head">
                          <span className="pp-card-name">{p.name}</span>
                          <span className="pp-tick" aria-hidden="true">
                            <PIcon name="check" size={16} />
                          </span>
                        </span>
                        <span className="pp-card-tag">{p.tagline}</span>
                        <span className="pp-bundle">
                          {inside.map((s) => (
                            <span key={s.id} className="pp-bundle-item">
                              <span className="pp-bundle-vis">
                                {s.media[0]?.url ? (
                                  isVideo(s.media[0].url) ? (
                                    <video src={s.media[0].url} autoPlay muted loop playsInline preload="metadata" />
                                  ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={s.media[0].url} alt="" loading="lazy" />
                                  )
                                ) : (
                                  <PIcon name={s.points[0]?.icon ?? "spark"} size={18} />
                                )}
                              </span>
                              <span className="pp-bundle-text">
                                <b>{s.short}</b>
                                {amountLabel(s, p.id) && <i>{amountLabel(s, p.id)}</i>}
                              </span>
                            </span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {current && current.kind === "topic" && (
              <section className="pp-topic">
                <div className="pp-topic-text">
                  <p className="pp-kicker pp-in" style={{ ["--d" as string]: 0 }}>
                    {current.kicker}
                  </p>
                  <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
                    {current.title}
                  </h1>
                  <ul className="pp-heads">
                    {current.headlines.map((h, i) => (
                      <li key={i} className="pp-in" style={{ ["--d" as string]: 2 + i }}>
                        {h}
                      </li>
                    ))}
                  </ul>
                  <div className="pp-points">
                    {current.points.map((pt, i) => (
                      <span key={i} className="pp-point pp-in" style={{ ["--d" as string]: 3 + current.headlines.length + i }}>
                        <PIcon name={pt.icon} size={18} />
                        {pt.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={`pp-mosaic pp-mosaic-${Math.min(current.media.length, 6)}`}>
                  {current.media.map((m, i) => (
                    <div key={i} className="pp-in" style={{ ["--d" as string]: 2 + i }}>
                      <MediaBox m={m} preview={preview} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {current && current.kind === "priced" && (
              <PricedSlide content={content} slide={current} pkg={pkg} extras={extras} preview={preview} onExtra={setExtra} onSeenBreakdown={() => track({ kind: "breakdown", slide: current.id, package: pkg })} />
            )}

            {stepId === "summary" && (
              <section className="pp-summary">
                <p className="pp-kicker pp-in" style={{ ["--d" as string]: 0 }}>
                  {pkgName}
                </p>
                <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
                  {content.summary.title}
                </h1>
                <p className="pp-sub pp-in" style={{ ["--d" as string]: 2 }}>
                  {content.summary.subtitle}
                </p>
                <div className="pp-tabs">
                  {t.groups
                    .filter((g) => g.slides.length)
                    .map((g, i) => {
                      const media = content.slides.filter((s) => s.group === g.id).flatMap((s) => s.media).find((m) => m.url) ?? null;
                      const open = openTab === g.id;
                      return (
                        <div key={g.id} className="pp-tab pp-in" data-open={open ? "true" : undefined} style={{ ["--d" as string]: 3 + i }}>
                          <button type="button" className="pp-tab-head" aria-expanded={open} onClick={() => setOpenTab(open ? null : g.id)}>
                            <span className="pp-tab-vis">
                              {media ? <MediaBox m={{ url: media.url, caption: "" }} preview={false} /> : <span className="pp-ph"><PIcon name={g.id === "visuals" ? "camera" : g.id === "ads" ? "megaphone" : "users"} size={26} /></span>}
                            </span>
                            <span className="pp-tab-label">
                              <i>{i + 1}.</i> {GROUPS.find((x) => x.id === g.id)?.label}
                            </span>
                            <span className="pp-tab-price">{money(g.subtotal)}<small>/mo</small></span>
                          </button>
                          {open && (
                            <ul className="pp-tab-list">
                              {g.slides.map((s) => (
                                <li key={s.slide.id}>
                                  <span>{s.slide.title}</span>
                                  <b>{money(s.subtotal)}</b>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                </div>

                <div className="pp-plan pp-in" style={{ ["--d" as string]: 6 }} role="radiogroup" aria-label="How to pay">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={plan === "monthly"}
                    onClick={() => {
                      setPlan("monthly");
                      track({ kind: "plan", package: pkg, detail: { plan: "monthly" } });
                    }}
                  >
                    <b>Monthly</b>
                    <span>{money(t.monthly)} a month</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={plan === "upfront"}
                    onClick={() => {
                      setPlan("upfront");
                      track({ kind: "plan", package: pkg, detail: { plan: "upfront" } });
                    }}
                  >
                    <b>3 months upfront</b>
                    <span>
                      {money(t.upfront)} · save {money(t.upfrontSaving)}
                    </span>
                    <em>{content.discountPct}% off</em>
                  </button>
                </div>

                <div className="pp-total pp-in" style={{ ["--d" as string]: 7 }}>
                  <div className="pp-total-num">
                    <span>Total</span>
                    <strong>{money(t.dueNow)}</strong>
                    <small>{plan === "upfront" ? "for 3 months" : "a month"}</small>
                    {t.budgetTotal > 0 && <em>Plus a suggested ad budget of {money(t.budgetTotal)} a month, paid by you directly to the platforms.</em>}
                  </div>
                  <div className="pp-go-wrap">
                    <button type="button" className="pp-go" onClick={letsGo} disabled={!allSeen} aria-describedby={!allSeen ? "pp-lock" : undefined}>
                      Let&rsquo;s go <Arrow />
                    </button>
                    {!allSeen && (
                      <p id="pp-lock" className="pp-lock">
                        Go through every page first.{" "}
                        <button type="button" onClick={() => setStepId(unseen[0])}>
                          Take me there
                        </button>
                      </p>
                    )}
                    <div className="pp-contract-row">
                      <button type="button" className="pp-contract-link" onClick={openContract}>
                        View the contract
                      </button>
                      <span className="pp-pointer" aria-hidden="true">
                        <svg width="64" height="40" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <path d="M62 30C46 34 26 30 12 14" />
                          <path d="M10 24L11 13L21 15" />
                        </svg>
                        This is your contract
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <footer className="pp-nav">
            <button type="button" className="pp-round pp-ghost" onClick={back} disabled={index === 0} aria-label="Back">
              <Arrow back />
            </button>
            <div className="pp-dots" aria-label={`Page ${index + 1} of ${steps.length}`}>
              {steps.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === index ? "step" : undefined}
                  data-seen={seen.has(s) ? "true" : undefined}
                  disabled={!seen.has(s) && i !== index}
                  onClick={() => go(i)}
                />
              ))}
            </div>
            {index < steps.length - 1 ? (
              <button type="button" className="pp-round pp-next" onClick={next} aria-label={stepId === "packages" ? `See what's inside ${pkgName}` : "Next"}>
                <Arrow />
              </button>
            ) : (
              <span className="pp-round-space" />
            )}
          </footer>
        </main>
      )}

      {stage === "email" && (
        <main className="pp-stage pp-step">
          <div className="pp-slide pp-narrow" key="email">
            <p className="pp-kicker pp-in" style={{ ["--d" as string]: 0 }}>
              {pkgName} · {plan === "upfront" ? "3 months upfront" : "Monthly"} · {money(t.dueNow)}
            </p>
            <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
              Nearly there{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="pp-sub pp-in" style={{ ["--d" as string]: 2 }}>
              Where should we send your proposal, contract and invoice?
            </p>
            <form
              className="pp-email pp-in"
              style={{ ["--d" as string]: 3 }}
              onSubmit={(e) => {
                e.preventDefault();
                submitEmail();
              }}
            >
              <label htmlFor="pp-email">Your email</label>
              <div className="pp-email-row">
                <input id="pp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" autoFocus required />
                <button type="submit" className="pp-round pp-next" disabled={busy} aria-label="Continue">
                  <Arrow />
                </button>
              </div>
              <p className="pp-fine">
                For {who.business}
                {who.contact ? `, ${who.contact}` : ""}. By continuing you agree to the{" "}
                <button type="button" className="pp-inline-link" onClick={openContract}>
                  contract
                </button>
                .
              </p>
              {error && <p className="pp-error" role="alert">{error}</p>}
            </form>
            <button type="button" className="pp-backlink pp-in" style={{ ["--d" as string]: 4 }} onClick={() => setStage("show")}>
              ← Back to the proposal
            </button>
          </div>
        </main>
      )}

      {stage === "method" && (
        <main className="pp-stage pp-step">
          <div className="pp-slide pp-narrow" key="method">
            <p className="pp-kicker pp-in" style={{ ["--d" as string]: 0 }}>
              {accepted?.invoiceNumber ? `Invoice ${accepted.invoiceNumber}` : pkgName}
            </p>
            <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
              How would you like to pay?
            </h1>
            <p className="pp-sub pp-in" style={{ ["--d" as string]: 2 }}>
              {accepted?.emailed ? `We've emailed your proposal, contract and invoice to ${email}. ` : ""}
              {money(accepted?.amount ?? t.dueNow)} {plan === "upfront" ? "for 3 months" : "today, then monthly"}.
            </p>
            <div className="pp-methods">
              <button type="button" className="pp-method pp-in" style={{ ["--d" as string]: 3 }} onClick={payCard} disabled={busy || !cardOn}>
                <PIcon name="check" />
                <b>Pay by card</b>
                <span>{cardOn ? "Secure payment with Stripe" : "Card payments are coming soon"}</span>
              </button>
              <button type="button" className="pp-method pp-in" style={{ ["--d" as string]: 4 }} onClick={payCash} disabled={busy}>
                <PIcon name="handshake" />
                <b>Pay in cash</b>
                <span>Pay us in person before we start</span>
              </button>
            </div>
            {error && <p className="pp-error" role="alert">{error}</p>}
            <button type="button" className="pp-backlink pp-in" style={{ ["--d" as string]: 5 }} onClick={() => setStage("show")}>
              ← Back to the proposal
            </button>
          </div>
        </main>
      )}

      {stage === "cash" && (
        <main className="pp-stage pp-step">
          <div className="pp-slide pp-narrow" key="cash">
            <span className="pp-done-mark pp-in" style={{ ["--d" as string]: 0 }} aria-hidden="true">
              <PIcon name="check" size={28} />
            </span>
            <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
              Paying in cash
            </h1>
            <p className="pp-sub pp-in" style={{ ["--d" as string]: 2 }}>
              Cash must be paid before we start. Once we&rsquo;ve received it, we&rsquo;ll note it here and set up your account.
            </p>
            <div className="pp-cash-box pp-in" style={{ ["--d" as string]: 3 }}>
              <span>Amount due</span>
              <strong>{money(accepted?.amount ?? t.dueNow)}</strong>
              {accepted?.invoiceNumber && <small>Invoice {accepted.invoiceNumber}</small>}
            </div>
            {code && (
              <p className="pp-fine pp-in" style={{ ["--d" as string]: 4 }}>
                <a href={`/proposal/${code}/invoice`}>View your invoice</a> · <a href={`/proposal/${code}/contract`}>View your contract</a>
              </p>
            )}
            {cardOn && (
              <button type="button" className="pp-backlink pp-in" style={{ ["--d" as string]: 5 }} onClick={() => setStage("method")}>
                Pay by card instead
              </button>
            )}
            {error && <p className="pp-error" role="alert">{error}</p>}
          </div>
        </main>
      )}

      {contractOpen && (
        <div className="pp-modal" role="dialog" aria-modal="true" aria-labelledby="pp-contract-title" onClick={closeContract}>
          <div className="pp-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pp-modal-head">
              <h2 id="pp-contract-title">Your contract</h2>
              <button type="button" className="pp-x" onClick={closeContract} aria-label="Close the contract" autoFocus>
                ×
              </button>
            </div>
            <pre className="pp-contract">{contractText(content, choice, { business: who.business, contact: who.contact, email: email || who.email })}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function PricedSlide({
  content,
  slide,
  pkg,
  extras,
  preview,
  onExtra,
  onSeenBreakdown,
}: {
  content: ProposalContent;
  slide: Slide;
  pkg: PackageId;
  extras: Record<string, number>;
  preview: boolean;
  onExtra: (s: Slide, xid: string, qty: number) => void;
  onSeenBreakdown: () => void;
}) {
  const price = priceSlide(content, slide, pkg, extras);
  const box = useRef<HTMLDivElement>(null);
  const told = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!told.current && entries.some((e) => e.isIntersecting)) {
          told.current = true;
          onSeenBreakdown();
          io.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onSeenBreakdown]);

  return (
    <section className="pp-priced">
      <div className="pp-priced-top">
        <div className="pp-priced-text">
          <p className="pp-kicker pp-in" style={{ ["--d" as string]: 0 }}>
            {slide.kicker}
          </p>
          <h1 className="pp-in" style={{ ["--d" as string]: 1 }}>
            {slide.title}
          </h1>
          {slide.headlines.map((h, i) => (
            <p key={i} className="pp-sub pp-in" style={{ ["--d" as string]: 2 + i }}>
              {h}
            </p>
          ))}
        </div>
        <div className="pp-strip">
          {slide.media.map((m, i) => (
            <div key={i} className="pp-in" style={{ ["--d" as string]: 2 + i }}>
              <MediaBox m={m} preview={preview} />
            </div>
          ))}
        </div>
      </div>

      <div className="pp-tiles">
        {slide.points.map((pt, i) => (
          <span key={i} className="pp-tile pp-in" style={{ ["--d" as string]: 3 + i }}>
            <span className="pp-tile-icon">
              <PIcon name={pt.icon} size={24} />
            </span>
            {pt.label}
          </span>
        ))}
      </div>

      <div className="pp-break pp-in" style={{ ["--d" as string]: 5 }} ref={box}>
        <div className="pp-break-head">
          <span>Price breakdown</span>
          <span>
            {money(content.rate)}/hr where hourly
          </span>
        </div>
        <ul className="pp-lines">
          {price.lines.map((l, i) => (
            <li key={i} data-extra={l.extra ? "true" : undefined}>
              <span className="pp-line-label">
                {l.extra && <em>Added</em>}
                {l.label}
              </span>
              <span className="pp-line-sum">{l.sum}</span>
              <b>{money(l.price)}</b>
            </li>
          ))}
        </ul>
        {slide.extras.length > 0 && (
          <div className="pp-extras">
            <span className="pp-extras-title">Add more</span>
            {slide.extras.map((x) => {
              const k = extraKey(slide, x);
              const n = extras[k] ?? 0;
              return (
                <div key={x.id} className="pp-extra" data-on={n > 0 ? "true" : undefined}>
                  <span className="pp-extra-label">
                    {x.label}
                    <small>+{money(linePrice(x, 1, content.rate))} each</small>
                  </span>
                  <span className="pp-step-ctl">
                    <button type="button" onClick={() => onExtra(slide, x.id, n - 1)} disabled={n === 0} aria-label={`One less: ${x.label}`}>
                      −
                    </button>
                    <output aria-live="polite">{n}</output>
                    <button type="button" onClick={() => onExtra(slide, x.id, n + 1)} disabled={n >= x.max} aria-label={`One more: ${x.label}`}>
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="pp-subtotal">
          <span>{slide.short || slide.title}</span>
          <strong>
            {money(price.subtotal)}
            <small>/month</small>
          </strong>
        </div>
        {price.budget ? (
          <p className="pp-budget">
            <PIcon name="megaphone" size={16} /> Suggested ad budget: <b>{money(price.budget)} a month</b>, paid by you directly. Not included above.
          </p>
        ) : null}
        {slide.note && <p className="pp-note">{slide.note}</p>}
      </div>
    </section>
  );
}
