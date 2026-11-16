"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { PackagePanel } from "@/components/PackagePanel";
import { describePackage, type PackagePreset, type PackageSettings } from "@/lib/packages";
import {
  createOnboardedClientAction,
  readMeetingAction,
  type MeetingDraft,
  type ReadMeetingState,
} from "./onboard-actions";

/**
 * Adding a client after the first meeting, in three steps:
 *   1. choose their package (from a saved one, or option by option);
 *   2. hand over the meeting (Fathom summary or transcript, notes, PDF);
 *   3. check what was filled in, see what is left for us, and create.
 */

const label: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-2)",
  marginBottom: 6,
};

const input: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
};

const hint: CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", lineHeight: 1.6, margin: 0 };

const STEPS = ["Package", "Meeting", "Check and create"];

export function OnboardWizard({
  presets,
  packagesAvailable,
  canRead,
}: {
  presets: PackagePreset[];
  packagesAvailable: boolean;
  /** False when no ANTHROPIC_API_KEY is set. */
  canRead: boolean;
}) {
  const [step, setStep] = useState(0);
  const [pkg, setPkg] = useState<PackageSettings | null>(null);
  const [presetId, setPresetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MeetingDraft | null>(null);

  return (
    <div className="onboard">
      <ol className="onboard-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : i === step ? "now" : ""}>
            <span>{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h2 className="onboard-h">What are they getting?</h2>
          <p style={{ ...hint, marginBottom: 20 }}>
            Pick one of your saved packages, or choose each option. This decides how many videos go on their schedule,
            which days we post, and how much say they have over each video.
          </p>
          <PackagePanel
            clientId=""
            clientName="this client"
            initial={null}
            presets={presets}
            available={packagesAvailable}
            editable={true}
            onPick={(value, id) => {
              setPkg(value);
              setPresetId(id);
            }}
          />
          <div className="onboard-actions">
            <button type="button" className="btn btn-primary" disabled={packagesAvailable && !pkg} onClick={() => setStep(1)}>
              Next: the meeting →
            </button>
            {!packagesAvailable && <span style={hint}>Packages switch on with database update 0041. You can set it later.</span>}
          </div>
        </section>
      )}

      {step === 1 && (
        <MeetingStep
          pkg={pkg}
          canRead={canRead}
          onBack={() => setStep(0)}
          onRead={(d) => {
            setDraft(d);
            setStep(2);
          }}
        />
      )}

      {step === 2 && draft && (
        <ReviewStep draft={draft} pkg={pkg} presetId={presetId} onBack={() => setStep(1)} />
      )}
    </div>
  );
}

const initial: ReadMeetingState = { error: null, draft: null };

function MeetingStep({
  pkg,
  canRead,
  onBack,
  onRead,
}: {
  pkg: PackageSettings | null;
  canRead: boolean;
  onBack: () => void;
  onRead: (d: MeetingDraft) => void;
}) {
  const [state, action] = useFormState(async (prev: ReadMeetingState, fd: FormData) => {
    const next = await readMeetingAction(prev, fd);
    if (next.draft) onRead(next.draft);
    return next;
  }, initial);

  return (
    <form action={action}>
      <h2 className="onboard-h">The meeting</h2>
      <p style={{ ...hint, marginBottom: 20 }}>
        Paste the Fathom summary or transcript, or upload the document. We fill in the client&rsquo;s details and their
        content plan from what was said, and list everything that wasn&rsquo;t covered, like fonts and colours, for you to
        fill in.
      </p>
      {!canRead && (
        <p className="access-note" role="status" style={{ marginBottom: 18 }}>
          Reading meetings needs an <strong>ANTHROPIC_API_KEY</strong> in Vercel&rsquo;s settings. Until then, add the
          client without it and fill the plan in by hand.
        </p>
      )}
      <input type="hidden" name="package" value={JSON.stringify(pkg)} />

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={label}>Client name</span>
        <input name="name" style={input} placeholder="Leave blank to take it from the meeting" />
      </label>
      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={label}>Meeting</span>
        <input name="title" style={input} placeholder="e.g. Discovery call, 12 Nov" />
      </label>
      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={label}>Notes, summary or transcript</span>
        <textarea name="notes" rows={10} style={{ ...input, resize: "vertical" }} placeholder="Paste from Fathom here" />
      </label>
      <label style={{ display: "block", marginBottom: 20 }}>
        <span style={label}>Or upload it</span>
        <input name="file" type="file" accept=".pdf,.txt,.md,.vtt,.srt,application/pdf,text/plain" />
        <span style={{ ...hint, display: "block", marginTop: 6 }}>PDF or text file, up to 4 MB.</span>
      </label>

      {state.error && (
        <p role="alert" style={{ color: "var(--status-closed)", fontSize: 13, margin: "0 0 14px" }}>
          {state.error}
        </p>
      )}

      <div className="onboard-actions">
        <button type="button" className="btn" onClick={onBack}>
          ← Back
        </button>
        {canRead && <ReadButton />}
        <SkipButton primary={!canRead} />
      </div>
    </form>
  );
}

function ReadButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Reading the meeting… (up to a minute)" : "Read the meeting"}
    </button>
  );
}

function SkipButton({ primary }: { primary: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="skip" value="1" className={primary ? "btn btn-primary" : "btn"} disabled={pending}>
      Add without reading a meeting
    </button>
  );
}

function ReviewStep({
  draft,
  pkg,
  presetId,
  onBack,
}: {
  draft: MeetingDraft;
  pkg: PackageSettings | null;
  presetId: string | null;
  onBack: () => void;
}) {
  const [name, setName] = useState(draft.businessName);
  const [stage, setStage] = useState<"proposal" | "active">("active");
  const [contactName, setContactName] = useState(draft.contactName);
  const [contactEmail, setContactEmail] = useState(draft.contactEmail);
  const [service, setService] = useState(draft.service);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const missingBasics = [
    !contactName.trim() && "Contact name",
    !contactEmail.trim() && "Contact email",
  ].filter(Boolean) as string[];

  function create() {
    setError(null);
    start(async () => {
      const res = await createOnboardedClientAction({
        name,
        stage,
        contactName,
        contactEmail,
        service,
        pkg,
        presetId,
        plan: draft.plan,
        ideas: draft.ideas,
        toAsk: draft.toAsk,
        meetingTitle: draft.meetingTitle,
        meetingText: draft.meetingText,
      });
      // Success redirects; only an error comes back.
      if (res?.error) setError(res.error);
    });
  }

  return (
    <section>
      <h2 className="onboard-h">Check and create</h2>

      <div className="row-2" style={{ marginBottom: 16 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={label}>Client name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} style={input} required />
        </label>
        <label style={{ display: "block", flex: 1 }}>
          <span style={label}>Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value as "proposal" | "active")} style={input}>
            <option value="active">Active</option>
            <option value="proposal">Proposal</option>
          </select>
        </label>
      </div>
      <div className="row-2" style={{ marginBottom: 16 }}>
        <label style={{ display: "block", flex: 1 }}>
          <span style={label}>Contact name</span>
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={input} />
        </label>
        <label style={{ display: "block", flex: 1 }}>
          <span style={label}>Contact email</span>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={input} />
        </label>
      </div>
      <label style={{ display: "block", marginBottom: 24 }}>
        <span style={label}>Service</span>
        <input value={service} onChange={(e) => setService(e.target.value)} style={input} placeholder="e.g. Social media video" />
      </label>

      <div className="onboard-review">
        <div className="card card-pad-sm">
          <h3 style={label}>Package</h3>
          <p style={{ margin: 0, fontSize: 14 }}>{pkg ? describePackage(pkg) : "Not chosen yet. Set it on the client's Package tab."}</p>
        </div>

        <div className="card card-pad-sm">
          <h3 style={label}>Filled in from the meeting</h3>
          {draft.filled.length ? (
            <ul className="onboard-list is-done">
              {draft.filled.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p style={hint}>Nothing yet. The plan starts blank.</p>
          )}
        </div>

        <div className="card card-pad-sm onboard-gaps">
          <h3 style={label}>For us to fill in</h3>
          <p style={{ ...hint, marginBottom: 8 }}>Not covered in the meeting. This list stays on the client&rsquo;s page until it&rsquo;s done.</p>
          <ul className="onboard-list is-todo">
            {[...missingBasics, ...draft.gaps.map((g) => g.label)].map((g) => (
              <li key={g}>{g}</li>
            ))}
            <li>The client&rsquo;s portal login</li>
          </ul>
        </div>

        {draft.toAsk.length > 0 && (
          <div className="card card-pad-sm">
            <h3 style={label}>Still to ask the client</h3>
            <ul className="onboard-list">
              {draft.toAsk.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p style={{ ...hint, margin: "18px 0" }}>
        The content plan is saved as a draft. The client only sees it once you publish it.
      </p>

      {error && (
        <p role="alert" style={{ color: "var(--status-closed)", fontSize: 13, margin: "0 0 14px" }}>
          {error}
        </p>
      )}
      <div className="onboard-actions">
        <button type="button" className="btn" onClick={onBack} disabled={pending}>
          ← Back
        </button>
        <button type="button" className="btn btn-primary" onClick={create} disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create client"}
        </button>
      </div>
    </section>
  );
}
