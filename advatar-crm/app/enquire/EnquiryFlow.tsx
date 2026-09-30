"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { submitEnquiry } from "./actions";
import {
  BUSINESS_TYPE,
  EMPTY_ENQUIRY,
  LOOKING_FOR,
  TIMING,
  budgetOptionsFor,
  type EnquiryFieldErrors,
  type EnquiryOption,
  type EnquiryPayload,
} from "@/lib/enquiry";

/** How long the old screen takes to fade before the new one starts. */
const FADE_MS = 170;

/** Long enough to see which box you picked before the screen moves. */
const CONFIRM_MS = 190;

type Screen = 1 | 2 | 3 | 4 | 5;

/**
 * The enquiry, as a short conversation rather than a form.
 *
 * Deliberately NOT a progress bar, step count or "Question 2 of 5".
 * Someone deciding whether to get in touch should not first be shown
 * how much work it is going to be; they answer one easy question,
 * then the next.
 *
 * Nothing is sent until the last screen. The answers live here in the
 * browser until then, so backing up and changing one costs nothing
 * and half an enquiry never reaches the CRM.
 */
export function EnquiryFlow() {
  const [screen, setScreen] = useState<Screen>(1);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [answers, setAnswers] = useState<EnquiryPayload>(EMPTY_ENQUIRY);
  const [fieldErrors, setFieldErrors] = useState<EnquiryFieldErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const moving = useRef(false);

  /** Fades the current screen out, swaps it, fades the new one in. */
  function goTo(next: Screen, delay = 0) {
    if (moving.current) return;
    moving.current = true;

    window.setTimeout(() => {
      setPhase("out");
      window.setTimeout(() => {
        setScreen(next);
        setPhase("in");
        moving.current = false;
        // Back to the top of the card: on a phone the next question
        // would otherwise open half-scrolled.
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, FADE_MS);
    }, delay);
  }

  function set<K extends keyof EnquiryPayload>(key: K, value: EnquiryPayload[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * The first screen picks one and moves on, like the three after it.
   *
   * Kept as an array rather than a single string so the answer shape,
   * the server action and the lead's notes all stay as they were —
   * this is a change to how the screen behaves, not to what an enquiry
   * is.
   *
   * Changing the answer clears any budget already chosen, because the
   * budget bands belong to the thing picked here: a band from one tier
   * would otherwise survive into another and describe a figure that
   * was never on screen.
   */
  function pickLookingFor(id: string) {
    setAnswers((prev) => {
      const lookingFor = [id];
      const bandsChanged = budgetOptionsFor(prev.lookingFor) !== budgetOptionsFor(lookingFor);
      return { ...prev, lookingFor, budget: bandsChanged ? null : prev.budget };
    });
    goTo(2, CONFIRM_MS);
  }

  /** Picking on a one-answer screen moves you on by itself. */
  function pickAndAdvance<K extends keyof EnquiryPayload>(key: K, value: EnquiryPayload[K], next: Screen) {
    set(key, value);
    goTo(next, CONFIRM_MS);
  }

  async function send() {
    setSending(true);
    setProblem(null);
    setFieldErrors({});

    const result = await submitEnquiry(answers);

    if (result.ok) {
      setSent(true);
      setSending(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSending(false);
    setProblem(result.message);
    setFieldErrors(result.fields ?? {});
  }

  if (sent) {
    return (
      <Card>
        <div className="enquire-step">
          <h1 style={headingStyle}>Thanks, we&rsquo;ve got your details.</h1>
          <p style={{ ...helperStyle, fontSize: 14 }}>
            We&rsquo;ll be in touch within 48 hours to book your discovery call.
          </p>
        </div>
      </Card>
    );
  }

  const canContinueScreen1 = answers.lookingFor.length > 0 || answers.lookingForOther.trim().length > 0;

  return (
    <Card>
      {/* Keyed on the screen so React remounts it and the fade-in runs
          again each time, rather than only on the first question. */}
      <div key={screen} className="enquire-step" data-phase={phase}>
        {screen > 1 && (
          <button type="button" onClick={() => goTo((screen - 1) as Screen)} style={backStyle} aria-label="Go back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        )}

        {screen === 1 && (
          <Question heading="What are you looking for?" helper="Pick whichever sounds most like you.">
            <Options
              options={LOOKING_FOR}
              selected={answers.lookingFor}
              onPick={pickLookingFor}
            />
            <OtherLine
              value={answers.lookingForOther}
              onChange={(v) => set("lookingForOther", v)}
            />
            {canContinueScreen1 && (
              <Continue onClick={() => goTo(2)} />
            )}
          </Question>
        )}

        {screen === 2 && (
          <Question heading="What best describes your business?" helper="So we understand your audience.">
            <Options
              options={BUSINESS_TYPE}
              selected={answers.businessType ? [answers.businessType] : []}
              onPick={(id) => pickAndAdvance("businessType", id, 3)}
            />
            <OtherLine
              value={answers.businessTypeOther}
              onChange={(v) => set("businessTypeOther", v)}
            />
            {(answers.businessTypeOther.trim().length > 0 || answers.businessType) && (
              <Continue onClick={() => goTo(3)} />
            )}
          </Question>
        )}

        {screen === 3 && (
          <Question heading="What's your monthly budget?" helper="A rough idea is fine.">
            {/* The bands follow what they picked on the first screen,
                so the numbers on offer are the numbers that make sense
                for the work they are actually asking about. */}
            <Options
              options={budgetOptionsFor(answers.lookingFor)}
              selected={answers.budget ? [answers.budget] : []}
              onPick={(id) => pickAndAdvance("budget", id, 4)}
            />
          </Question>
        )}

        {screen === 4 && (
          <Question heading="When would you like to start?" helper="Just so we can plan ahead.">
            <Options
              options={TIMING}
              selected={answers.timing ? [answers.timing] : []}
              onPick={(id) => pickAndAdvance("timing", id, 5)}
            />
          </Question>
        )}

        {screen === 5 && (
          <Question heading="Where can we reach you?" helper="We'll get back to you within 48 hours.">
            <div style={{ marginTop: 4 }}>
              <Field
                label="Your name"
                value={answers.name}
                onChange={(v) => set("name", v)}
                error={fieldErrors.name}
                autoComplete="name"
              />
              <Field
                label="Business name"
                value={answers.business}
                onChange={(v) => set("business", v)}
                error={fieldErrors.business}
                autoComplete="organization"
              />
              <Field
                label="Phone number"
                value={answers.phone}
                onChange={(v) => set("phone", v)}
                error={fieldErrors.phone}
                type="tel"
                autoComplete="tel"
              />
              <Field
                label="Email"
                optional
                value={answers.email}
                onChange={(v) => set("email", v)}
                error={fieldErrors.email}
                type="email"
                autoComplete="email"
              />
              <Field
                label="Instagram page"
                optional
                value={answers.instagram}
                onChange={(v) => set("instagram", v)}
                placeholder="@yourbusiness"
              />
              <Field
                label="Website link"
                optional
                value={answers.website}
                onChange={(v) => set("website", v)}
                placeholder="yourbusiness.co.uk"
              />
              <Field
                label="Anything else?"
                optional
                as="textarea"
                value={answers.anythingElse}
                onChange={(v) => set("anythingElse", v)}
                placeholder="Anything you'd like us to know before we call."
              />

              {/* The honeypot. Off-screen, skipped by the keyboard and
                  hidden from screen readers, so no person ever meets
                  it — but a bot filling every field in the page will.
                  Anything in it and the enquiry is quietly dropped. */}
              <input
                className="enquire-hp"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={answers.hp}
                onChange={(e) => set("hp", e.target.value)}
              />

              {problem && (
                <p role="alert" style={{ ...helperStyle, color: "var(--status-closed)", marginBottom: 14 }}>
                  {problem}
                </p>
              )}

              <button type="button" onClick={send} disabled={sending} style={sendStyle(sending)}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </Question>
        )}
      </div>
    </Card>
  );
}

// =================================================================
// Pieces
// =================================================================

function Card({ children }: { children: ReactNode }) {
  return (
    <main className="login-shell">
      <div className="enquire-card">
        {/* The same wordmark, the same size, in the same place as the
            sign-in card — this is the same company, one page along. */}
        <div style={{ marginBottom: 22 }}>
          <Logo height={34} variant="full" />
        </div>
        {children}
      </div>
    </main>
  );
}

function Question({ heading, helper, children }: { heading: string; helper: string; children: ReactNode }) {
  return (
    <>
      <h1 style={headingStyle}>{heading}</h1>
      <p style={helperStyle}>{helper}</p>
      {children}
    </>
  );
}

function Options({
  options,
  selected,
  onPick,
}: {
  options: EnquiryOption[];
  selected: string[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="enquire-options">
      {options.map((option) => {
        const active = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(option.id)}
            className="enquire-option"
            style={{
              // The CLIENT / STAFF toggle on the sign-in card, grown
              // up: a quiet border until it is yours, white when it is.
              border: `1px solid ${active ? "var(--text-1)" : "var(--border)"}`,
              background: active ? "var(--surface-2)" : "transparent",
              color: active ? "var(--text-1)" : "var(--text-2)",
            }}
          >
            {/* Read out as part of the button's name rather than
                hidden, because "Best Results & Revenue Booster" is a
                reason to choose this one and someone using a screen
                reader deserves to hear it too. */}
            {option.badge && <span className="enquire-option-badge">{option.badge}</span>}
            <span aria-hidden="true" className="enquire-option-emoji">
              {option.emoji}
            </span>
            <span className="enquire-option-title">{option.title}</span>
            <span className="enquire-option-desc">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function OtherLine({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Something else? Type it here"
      aria-label="Something else"
      style={{ ...inputStyle, marginTop: 12 }}
    />
  );
}

function Continue({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ ...sendStyle(false), marginTop: 18 }} className="enquire-continue">
      Continue
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  optional = false,
  as = "input",
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  optional?: boolean;
  as?: "input" | "textarea";
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const shared = {
    value,
    placeholder,
    autoComplete,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    style: {
      ...inputStyle,
      borderColor: error ? "var(--status-closed)" : "var(--border)",
    },
  };

  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={labelStyle}>
        {label}
        {optional && <span style={{ color: "var(--text-3)", marginLeft: 6 }}>(optional)</span>}
      </span>

      {as === "textarea" ? (
        <textarea {...shared} rows={3} style={{ ...shared.style, resize: "vertical" }} />
      ) : (
        <input {...shared} type={type} />
      )}

      {error && (
        <span
          role="alert"
          style={{
            display: "block",
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--status-closed)",
            marginTop: 6,
          }}
        >
          {error}
        </span>
      )}
    </label>
  );
}

// =================================================================
// Styles lifted from the sign-in card, so the two read as one thing
// =================================================================

const headingStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 30,
  lineHeight: 1.1,
  letterSpacing: "0.01em",
  color: "var(--text-1)",
  margin: "0 0 8px",
};

const helperStyle: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--text-3)",
  margin: "0 0 20px",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};

const backStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "none",
  border: "none",
  padding: 0,
  marginBottom: 16,
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

function sendStyle(pending: boolean): CSSProperties {
  return {
    width: "100%",
    padding: "12px 0",
    borderRadius: "var(--radius-sm)",
    border: "none",
    background: "var(--text-1)",
    color: "var(--bg)",
    fontFamily: "var(--font-body)",
    fontWeight: 600,
    fontSize: 14,
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.6 : 1,
  };
}
