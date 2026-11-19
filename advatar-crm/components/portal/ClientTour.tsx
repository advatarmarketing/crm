"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { markTourSeenAction } from "@/app/app/portal/tour-actions";

/**
 * The client's first-login welcome, the guided tour of their pages, and
 * the ⓘ button that replays the tour.
 *
 * Shown once per account: the layout reads profiles.tour_seen_at (0048)
 * and only then mounts this with `autoStart`. It's marked seen the
 * moment the welcome opens, so it never comes back on another device —
 * even if they close the tab halfway through.
 *
 * Mounted in the portal layout, which stays put while the client moves
 * between pages, so the tour carries on across page changes.
 */

type Step = { path: string; selector: string; title: string; body: string };

const ALL_STEPS: Step[] = [
  {
    path: "/app/portal",
    selector: "main",
    title: "Your dashboard",
    body: "Your home page. What’s happening this month, what needs you, and what’s coming up, all at a glance.",
  },
  {
    path: "/app/portal/videos",
    selector: "main",
    title: "Your videos",
    body: "Every video we make for you lands here. Watch it, approve it, or tell us exactly what to change.",
  },
  {
    path: "/app/portal/calendar",
    selector: "main",
    title: "Calendar",
    body: "Shoot days, posting dates and calls, so you always know what’s next.",
  },
  {
    path: "/app/portal/plan",
    selector: ".planner-doc .page-nav, main",
    title: "Content Plan",
    body: "Your strategy. Start with the Overview for this month’s goals, then flick through the tabs for pillars, formats and your videos.",
  },
  {
    path: "/app/portal/content",
    selector: "[data-tour='hub-dashboard'], main",
    title: "Content Hub",
    body: "How your social media is performing: followers, likes, comments and your most popular videos, refreshed every day.",
  },
  {
    path: "/app/portal/account",
    selector: "main",
    title: "Account",
    body: "Your invoices and account details, in one place.",
  },
  {
    path: "/app/portal/messages",
    selector: "main",
    title: "Messages",
    body: "Talk to the team directly. We’ll reply right here.",
  },
  {
    path: "/app/portal/uploads",
    selector: "[data-tour='files-grid'], main",
    title: "Files",
    body: "Assets, raw footage, invoices, proposals and contracts, each in its own section. Tap one to open it.",
  },
  {
    path: "/app/portal/documents",
    selector: "main",
    title: "Documents",
    body: "Briefs and other documents we’ve shared with you.",
  },
  {
    path: "/app/portal/logins",
    selector: "main",
    title: "Logins",
    body: "The social media logins we hold for you, kept securely.",
  },
  {
    path: "/app/portal/todo",
    selector: "main",
    title: "To-do",
    body: "Anything we need from you, so nothing holds your content up.",
  },
  {
    path: "/app/portal/notes",
    selector: "main",
    title: "Notes",
    body: "Jot down ideas and thoughts for your content whenever they come to you.",
  },
];

const WELCOME: { lines: React.ReactNode[] }[] = [
  { lines: [<h1 key="a">Welcome to your marketing dashboard</h1>] },
  {
    lines: [
      <h2 key="a">Taking marketing seriously is the best decision you can make as a business, organisation or brand.</h2>,
      <p key="b">This lets you grow and scale while you focus on delivering your service. Leave the rest to us 🙂</p>,
    ],
  },
  {
    lines: [
      <h2 key="a">Over the last two years, we&rsquo;ve created campaigns and visuals for over 60 brands, so rest assured you&rsquo;re in safe hands 😊</h2>,
      <p key="b" className="ct-grey">
        Want to see our work? Check out our website at{" "}
        <a href="https://www.advatar.co.uk" target="_blank" rel="noopener noreferrer">
          www.advatar.co.uk
        </a>
      </p>,
    ],
  },
  {
    lines: [
      <h2 key="a">We&rsquo;re looking forward to strategising and creating even more results with you!</h2>,
      <p key="b">Let&rsquo;s get right into your app.</p>,
    ],
  },
];

type Mode = { kind: "idle" } | { kind: "welcome"; screen: number } | { kind: "tour"; step: number } | { kind: "done" } | { kind: "ask" };

function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {back ? <path d="M19 12H5M11 6l-6 6 6 6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
    </svg>
  );
}

export function ClientTour({ autoStart, hidden = [] }: { autoStart: boolean; hidden?: string[] }) {
  const steps = useMemo(() => ALL_STEPS.filter((s) => !hidden.includes(s.path)), [hidden]);
  const [mode, setMode] = useState<Mode>(autoStart ? { kind: "welcome", screen: 0 } : { kind: "idle" });
  const router = useRouter();
  const pathname = usePathname();
  const marked = useRef(false);

  // Seen as soon as it opens — once per account, on any device.
  useEffect(() => {
    if (autoStart && !marked.current) {
      marked.current = true;
      markTourSeenAction().catch(() => undefined);
    }
  }, [autoStart]);

  // Esc closes whatever is open.
  useEffect(() => {
    if (mode.kind === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode({ kind: "idle" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode.kind]);

  // No scrolling the page behind the welcome.
  useEffect(() => {
    if (mode.kind !== "welcome" && mode.kind !== "done") return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [mode.kind]);

  const startTour = useCallback(() => setMode({ kind: "tour", step: 0 }), []);

  // Drawn straight into <body>. The app shell animates page changes
  // with a transform, and anything position:fixed inside a transformed
  // parent is pinned to that parent instead of the screen — which left
  // the welcome sitting below the menu rather than covering it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <>
      {mode.kind === "welcome" && (
        <Welcome
          screen={mode.screen}
          onNext={() => (mode.screen < WELCOME.length - 1 ? setMode({ kind: "welcome", screen: mode.screen + 1 }) : startTour())}
          onSkip={() => setMode({ kind: "idle" })}
        />
      )}

      {mode.kind === "tour" && steps[mode.step] && (
        <Spotlight
          key={mode.step}
          step={steps[mode.step]}
          index={mode.step}
          total={steps.length}
          pathname={pathname}
          navigate={(p) => router.push(p)}
          onBack={mode.step > 0 ? () => setMode({ kind: "tour", step: mode.step - 1 }) : null}
          onNext={() => (mode.step < steps.length - 1 ? setMode({ kind: "tour", step: mode.step + 1 }) : setMode({ kind: "done" }))}
          onClose={() => setMode({ kind: "idle" })}
        />
      )}

      {mode.kind === "done" && (
        <div className="ct-scrim ct-scrim-soft" role="dialog" aria-modal="true" aria-labelledby="ct-done-title">
          <div className="ct-done">
            <span className="ct-done-mark" aria-hidden="true">✓</span>
            <h2 id="ct-done-title">You&rsquo;re all set</h2>
            <p>That&rsquo;s everything. You can replay this tour any time from the ⓘ button in the corner.</p>
            <button
              type="button"
              className="ct-primary"
              autoFocus
              onClick={() => {
                setMode({ kind: "idle" });
                router.push("/app/portal");
              }}
            >
              Let&rsquo;s go
            </button>
          </div>
        </div>
      )}

      {/* The replay button. Hidden while the welcome or tour is open. */}
      {(mode.kind === "idle" || mode.kind === "ask") && (
        <div className="ct-info-wrap">
          {mode.kind === "ask" && (
            <div className="ct-ask" role="dialog" aria-labelledby="ct-ask-q">
              <p id="ct-ask-q">Would you like to see the app tour again?</p>
              <div className="ct-ask-row">
                <button type="button" className="ct-primary ct-sm" autoFocus onClick={startTour}>
                  Yes, show me
                </button>
                <button type="button" className="ct-ghost ct-sm" onClick={() => setMode({ kind: "idle" })}>
                  No thanks
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            className="ct-info"
            aria-label="App tour"
            aria-expanded={mode.kind === "ask"}
            onClick={() => setMode(mode.kind === "ask" ? { kind: "idle" } : { kind: "ask" })}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M12 11v6" />
              <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
            </svg>
          </button>
        </div>
      )}
    </>,
    document.body
  );
}

function Welcome({ screen, onNext, onSkip }: { screen: number; onNext: () => void; onSkip: () => void }) {
  const last = screen === WELCOME.length - 1;
  return (
    <div className="ct-welcome" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="ct-orb ct-orb-a" aria-hidden="true" />
      <div className="ct-orb ct-orb-b" aria-hidden="true" />
      <button type="button" className="ct-skip" onClick={onSkip}>
        Skip
      </button>

      {/* Keyed by screen, so each one plays its entrance afresh. */}
      <div className="ct-screen" key={screen}>
        {WELCOME[screen].lines.map((line, i) => (
          <div key={i} className="ct-line" style={{ animationDelay: `${180 + i * 420}ms` }}>
            {line}
          </div>
        ))}
      </div>

      <div className="ct-foot">
        <div className="ct-progress" aria-hidden="true">
          {WELCOME.map((_, i) => (
            <span key={i} data-on={i <= screen ? "true" : undefined} />
          ))}
        </div>
        <button
          type="button"
          className="ct-next"
          onClick={onNext}
          aria-label={last ? "Start the tour" : "Next"}
          autoFocus
          style={{ animationDelay: `${500 + WELCOME[screen].lines.length * 300}ms` }}
        >
          <Arrow />
        </button>
      </div>
    </div>
  );
}

type Box = { top: number; left: number; width: number; height: number };

function Spotlight({
  step,
  index,
  total,
  pathname,
  navigate,
  onBack,
  onNext,
  onClose,
}: {
  step: Step;
  index: number;
  total: number;
  pathname: string | null;
  navigate: (p: string) => void;
  onBack: (() => void) | null;
  onNext: () => void;
  onClose: () => void;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(0);
  const target = useRef<Element | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [popH, setPopH] = useState(180);

  // Take them to the page first.
  useEffect(() => {
    const here = pathname === step.path && !window.location.search.includes("section=");
    if (!here) navigate(step.path);
  }, [pathname, step.path, navigate]);

  // Then find what to point at, once the page has drawn it.
  useEffect(() => {
    if (pathname !== step.path) return;
    let cancelled = false;
    let tries = 0;
    target.current = null;
    setBox(null);
    const wanted = step.selector.split(",").map((x) => x.trim());
    const shown = (sel: string) => {
      const x = document.querySelector(sel) as HTMLElement | null;
      return x && x.offsetHeight > 0 ? x : null;
    };
    const find = () => {
      if (cancelled) return;
      // The first choice is waited for (pages load their parts after
      // they appear); the fallbacks only after a few seconds.
      const el = shown(wanted[0]) ?? (tries > 30 ? wanted.slice(1).map(shown).find(Boolean) ?? null : null);
      if (el || tries > 40) {
        target.current = el ?? document.querySelector("main");
        target.current?.scrollIntoView({ block: "start", behavior: "smooth" });
        window.setTimeout(measure, 420);
        return;
      }
      tries++;
      window.setTimeout(find, 100);
    };
    const measure = () => {
      if (cancelled || !target.current) return;
      const r = target.current.getBoundingClientRect();
      const pad = 10;
      // A whole page is taller than the screen: light up what's in view.
      const top = Math.max(r.top - pad, 4);
      const bottom = Math.min(r.bottom + pad, window.innerHeight - 12);
      setVw(window.innerWidth);
      setBox({
        top,
        left: Math.max(r.left - pad, 8),
        width: Math.min(r.width + pad * 2, window.innerWidth - 16),
        height: Math.max(bottom - top, 60),
      });
    };
    find();
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove);
    };
  }, [pathname, step.path, step.selector]);

  useLayoutEffect(() => {
    if (pop.current) setPopH(pop.current.offsetHeight);
  }, [box]);

  // Next to the spotlight: below it if there's room, else above, else
  // over its lower edge. On a phone it's a sheet along the bottom.
  const phone = vw > 0 && vw < 640;
  let style: React.CSSProperties = {};
  if (box && !phone) {
    const width = 340;
    const left = Math.min(Math.max(box.left, 16), vw - width - 16);
    const below = box.top + box.height + 14;
    const above = box.top - popH - 14;
    const top = below + popH < window.innerHeight - 8 ? below : above > 8 ? above : window.innerHeight - popH - 24;
    style = { top, left, width };
  }

  return (
    <div className="ct-tour" role="dialog" aria-modal="true" aria-labelledby="ct-step-title">
      {/* Darkens everything except the spotlit area. Clicks on the dark
          part are swallowed so the page isn't used mid-step. */}
      <div className="ct-block" onClick={(e) => e.stopPropagation()} />
      {box ? (
        <div className="ct-hole" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
      ) : (
        <div className="ct-hole ct-hole-wait" />
      )}

      <div ref={pop} className={phone ? "ct-pop ct-pop-sheet" : "ct-pop"} style={style} data-ready={box ? "true" : undefined}>
        <div className="ct-pop-top">
          <span className="ct-count">
            {index + 1} of {total}
          </span>
          <button type="button" className="ct-x" onClick={onClose} aria-label="End the tour">
            ×
          </button>
        </div>
        <h3 id="ct-step-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="ct-pop-row">
          {onBack ? (
            <button type="button" className="ct-ghost ct-sm" onClick={onBack}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="ct-primary ct-sm" onClick={onNext} autoFocus>
            {index === total - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
