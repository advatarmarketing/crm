"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addExampleAction,
  deleteExampleAction,
  generateRepliesAction,
  markCopiedAction,
  rateRunAction,
  savePlaybookAction,
} from "@/app/app/messages/replier-actions";
import { CHANNELS, REPLYING_AS, type Channel, type Playbook, type ReplierExample, type ReplierRun, type ReplyingAs } from "@/lib/replier";

/**
 * Paste a client's message, get the best reply and two more. When the
 * message needs the CEO first, the replies are holding replies and the
 * CEO gets a to-do. The CEO also sees what's waiting for them, and edits
 * the playbook and examples the replies are written from.
 */

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function ProfessionalReplier({
  isCeo,
  available,
  keyOn,
  clients,
  names,
  initialRuns,
  waiting,
  playbook,
  examples: initialExamples,
  focusRun,
  defaultRole,
}: {
  isCeo: boolean;
  available: boolean;
  keyOn: boolean;
  clients: { id: string; name: string }[];
  /** Team names by id, for "who asked". */
  names: Record<string, string>;
  initialRuns: ReplierRun[];
  /** CEO only: messages others sent that need a decision. */
  waiting: ReplierRun[];
  playbook: Playbook | null;
  examples: ReplierExample[];
  focusRun: string | null;
  defaultRole: ReplyingAs;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [current, setCurrent] = useState<ReplierRun | null>(
    (focusRun && ([...initialRuns, ...waiting].find((r) => r.id === focusRun) ?? null)) || null
  );
  const [message, setMessage] = useState("");
  const [extra, setExtra] = useState("");
  const [clientId, setClientId] = useState("");
  const [role, setRole] = useState<ReplyingAs>(defaultRole);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  if (!available) return <p className="access-note">The Professional Replier starts once database update 0056 has been run in Supabase.</p>;

  function write() {
    setError(null);
    start(async () => {
      const res = await generateRepliesAction({ message, clientId: clientId || null, replyingAs: role, channel, extra });
      if (res.error || !res.run) return setError(res.error ?? "Something went wrong.");
      setRuns((rs) => [res.run!, ...rs].slice(0, 30));
      setCurrent(res.run);
      requestAnimationFrame(() => document.getElementById("pr-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  }

  function update(run: ReplierRun) {
    setRuns((rs) => rs.map((r) => (r.id === run.id ? run : r)));
    setCurrent(run);
  }

  return (
    <div className="pr">
      <header className="pr-head">
        <div>
          <h2 className="pr-title">Professional Replier</h2>
          <p className="pr-sub">Paste a client&rsquo;s message. You get the best reply to send, two other good ones, and a warning when it needs the CEO first.</p>
        </div>
      </header>

      {isCeo && waiting.length > 0 && (
        <section className="pr-waiting" aria-labelledby="pr-wait-h">
          <h3 id="pr-wait-h">Waiting for you ({waiting.length})</h3>
          <ul>
            {waiting.map((r) => (
              <li key={r.id}>
                <button type="button" className="pr-wait-item" onClick={() => setCurrent(r)} aria-pressed={current?.id === r.id}>
                  <strong>
                    {names[r.created_by] ?? "Someone"} · {r.client_id ? clientName.get(r.client_id) ?? "A client" : "No client chosen"}
                  </strong>
                  <span>{r.ceo_reason}</span>
                  <small>{when(r.created_at)}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card card-pad pr-form" aria-label="The client's message">
        {!keyOn && <p className="access-note">This needs the ANTHROPIC_API_KEY in Vercel&rsquo;s settings, the same key the meeting reader uses.</p>}
        <div className="pr-row">
          <label>
            <span className="vm-label">Client</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Not a client yet / not listed</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="vm-label">Replying as</span>
            <select value={role} onChange={(e) => setRole(e.target.value as ReplyingAs)}>
              {REPLYING_AS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="vm-label">Where</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="pr-msg">
          <span className="vm-label">The client&rsquo;s message</span>
          <textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={"Paste it here, e.g.\n“Hey, just wondering when you’re coming to film this month?”"}
            maxLength={8000}
          />
        </label>
        <details className="pr-extra">
          <summary>Anything the replier should know? (optional)</summary>
          <textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={2000} placeholder="e.g. We can only film Tuesdays this month. They were unhappy last week." />
        </details>
        <div className="pr-actions">
          <button type="button" className="btn btn-primary" onClick={write} disabled={pending || !message.trim() || !keyOn}>
            {pending ? "Writing replies… (about 20 seconds)" : "Write replies"}
          </button>
          {current && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMessage("");
                setExtra("");
                setCurrent(null);
              }}
            >
              New message
            </button>
          )}
        </div>
        {error && (
          <p className="vm-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {current && <Result key={current.id} run={current} isCeo={isCeo} mine={!waiting.some((w) => w.id === current.id)} clientName={current.client_id ? clientName.get(current.client_id) ?? null : null} onChange={update} />}

      {runs.length > 0 && (
        <details className="pr-history">
          <summary>Recent ({runs.length})</summary>
          <ul>
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setCurrent(r)} aria-pressed={current?.id === r.id}>
                  <span className="pr-h-when">{when(r.created_at)}</span>
                  <span className="pr-h-msg">{r.client_message.replace(/\s+/g, " ").slice(0, 90)}</span>
                  {r.client_id && <span className="pr-h-client">{clientName.get(r.client_id)}</span>}
                  {r.needs_ceo && <span className="pill pill-warn">Needs CEO</span>}
                  {r.chosen != null && <span className="pill">Sent option {r.chosen + 1}</span>}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {isCeo && <PlaybookEditor initial={playbook} examples={initialExamples} />}
    </div>
  );
}

function Result({ run, isCeo, mine, clientName, onChange }: { run: ReplierRun; isCeo: boolean; mine: boolean; clientName: string | null; onChange: (r: ReplierRun) => void }) {
  const [copied, setCopied] = useState<number | null>(null);
  const [feedback, setFeedback] = useState(run.feedback ?? "");
  const [saving, setSaving] = useState<number | null>(null);
  const [exampleText, setExampleText] = useState("");
  const [exampleNote, setExampleNote] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const r = run.result;

  async function copy(i: number) {
    try {
      await navigator.clipboard.writeText(r.replies[i].text);
    } catch {
      // Older browsers: select the text so it can be copied by hand.
      const el = document.getElementById(`pr-reply-${i}`);
      if (el) window.getSelection()?.selectAllChildren(el);
    }
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 2200);
    onChange({ ...run, chosen: i, copied_at: new Date().toISOString() });
    await markCopiedAction(run.id, i);
  }

  async function rate(v: -1 | 1) {
    const value = run.rating === v ? null : v;
    onChange({ ...run, rating: value });
    await rateRunAction(run.id, value, feedback);
  }

  async function saveExample() {
    const res = await addExampleAction(run.client_message, exampleText, exampleNote);
    setNote(res.error ?? "Saved. Future replies will learn from it.");
    if (!res.error) setSaving(null);
  }

  return (
    <section id="pr-result" className="pr-result" aria-labelledby="pr-result-h">
      <h3 id="pr-result-h" className="sr-only">
        Replies
      </h3>
      <div className="pr-quote">
        <span className="vm-label">{clientName ?? "Client"} said</span>
        <p>{run.client_message}</p>
      </div>
      <p className="pr-understanding">
        <span>What they&rsquo;re asking</span> {r.understanding}
      </p>

      {r.needs_ceo && (
        <div className="pr-ceo" role="status">
          <strong>Needs the CEO first: {r.ceo_reason}</strong>
          <p>
            These are holding replies: they don&rsquo;t agree to, price or promise anything.{" "}
            {isCeo && !mine ? "You’ve been sent this as a to-do." : isCeo ? "Decide, then reply." : "The CEO has been sent a to-do, so speak to them before going further."}
          </p>
          {r.note_to_ceo && <p className="pr-ceo-note">{r.note_to_ceo}</p>}
        </div>
      )}

      <ol className="pr-replies">
        {r.replies.map((x, i) => (
          <li key={i} className="pr-reply" data-best={i === 0 ? "" : undefined} data-chosen={run.chosen === i ? "" : undefined}>
            <div className="pr-reply-head">
              <span className="pr-badge">{i === 0 ? "Best reply" : `Option ${i + 1}`}</span>
              <span className="pr-reply-label">{x.label}</span>
              <button type="button" className={i === 0 ? "btn btn-primary pr-copy" : "btn pr-copy"} onClick={() => copy(i)} aria-label={`Copy ${i === 0 ? "the best reply" : `option ${i + 1}`}`}>
                {copied === i ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <p className="pr-text" id={`pr-reply-${i}`}>
              {x.text}
            </p>
            <p className="pr-why">{x.why}</p>
            {isCeo && (
              <div className="pr-ex">
                {saving === i ? (
                  <div className="pr-ex-form">
                    <label>
                      <span className="vm-label">The reply as it should be (edit it if you like)</span>
                      <textarea rows={4} value={exampleText} onChange={(e) => setExampleText(e.target.value)} />
                    </label>
                    <label>
                      <span className="vm-label">Why it&rsquo;s good (optional)</span>
                      <input value={exampleNote} onChange={(e) => setExampleNote(e.target.value)} maxLength={1000} />
                    </label>
                    <div className="pr-actions">
                      <button type="button" className="btn btn-primary" onClick={saveExample}>
                        Save as an example
                      </button>
                      <button type="button" className="btn" onClick={() => setSaving(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="vm-link"
                    onClick={() => {
                      setExampleText(x.text);
                      setExampleNote("");
                      setNote(null);
                      setSaving(i);
                    }}
                  >
                    Teach it: save as a good example
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {note && (
        <p className="pr-saved" role="status">
          {note}
        </p>
      )}

      {r.check_first.length > 0 && (
        <div className="pr-check">
          <strong>Check before sending</strong>
          <ul>
            {r.check_first.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="pr-rate">
        <span>Were these good?</span>
        <button type="button" className="btn" aria-pressed={run.rating === 1} onClick={() => rate(1)}>
          👍 Yes
        </button>
        <button type="button" className="btn" aria-pressed={run.rating === -1} onClick={() => rate(-1)}>
          👎 Not quite
        </button>
        {run.rating === -1 && (
          <label className="pr-feedback">
            <span className="sr-only">What was wrong</span>
            <input value={feedback} onChange={(e) => setFeedback(e.target.value)} onBlur={() => rateRunAction(run.id, -1, feedback)} placeholder="What was off? The CEO sees this." maxLength={2000} />
          </label>
        )}
      </div>
    </section>
  );
}

function PlaybookEditor({ initial, examples: initialExamples }: { initial: Playbook | null; examples: ReplierExample[] }) {
  const [p, setP] = useState<Omit<Playbook, "updated_at">>({
    needs_ceo: initial?.needs_ceo ?? "",
    house_style: initial?.house_style ?? "",
    never_promise: initial?.never_promise ?? "",
    facts: initial?.facts ?? "",
  });
  const [examples, setExamples] = useState(initialExamples);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (key: keyof typeof p, label: string, hint: string, rows: number) => (
    <label className="pr-pb-field">
      <span className="vm-label">{label}</span>
      <span className="pr-pb-hint">{hint}</span>
      <textarea rows={rows} value={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.value })} />
    </label>
  );
  return (
    <details className="card card-pad pr-playbook">
      <summary>
        <strong>Playbook</strong> <span>How every reply is written. Only you can change it.</span>
      </summary>
      <div className="pr-pb-grid">
        {field("needs_ceo", "Needs you first", "One per line. When a message touches any of these, the replies hold and you get a to-do.", 8)}
        {field("house_style", "House style", "How Advatar sounds.", 6)}
        {field("never_promise", "Never promise", "One per line.", 5)}
        {field("facts", "Facts about Advatar", "Packages, how filming works, turnaround, anything the replies may state as fact.", 6)}
      </div>
      <div className="pr-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await savePlaybookAction(p);
              setMsg(res.error ?? "Playbook saved. The next replies use it.");
            })
          }
        >
          {pending ? "Saving…" : "Save playbook"}
        </button>
        {msg && <span className="pr-saved">{msg}</span>}
      </div>
      <h4 className="pr-ex-h">Good examples ({examples.length})</h4>
      {examples.length === 0 ? (
        <p className="pr-pb-hint">None yet. Under any reply, press &ldquo;Teach it&rdquo; to save it here; the replier copies their tone and judgement.</p>
      ) : (
        <ul className="pr-ex-list">
          {examples.map((e) => (
            <li key={e.id}>
              <p>
                <span className="vm-label">Client</span> {e.client_message}
              </p>
              <p>
                <span className="vm-label">Reply</span> {e.reply}
              </p>
              {e.note && <p className="pr-pb-hint">{e.note}</p>}
              <button
                type="button"
                className="vm-link"
                onClick={async () => {
                  const res = await deleteExampleAction(e.id);
                  if (res.error) return setMsg(res.error);
                  setExamples((xs) => xs.filter((x) => x.id !== e.id));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
