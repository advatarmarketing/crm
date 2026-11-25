"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cashReceivedAction,
  clientLoginDetailsAction,
  deleteDraftAction,
  finishSetupAction,
  markSentAction,
  newVersionAction,
  saveDealAction,
} from "@/app/app/prospects/proposal-actions";
import { fill, money } from "@/lib/proposals/pricing";
import { duration, type Report } from "@/lib/proposals/tracking";

export interface DealVersion {
  id: string;
  version: number;
  status: string;
  link: string;
  message: string;
  createdAt: string;
  sentAt: string | null;
  openedAt: string | null;
  finishedAt: string | null;
  acceptedAt: string | null;
  acceptedEmail: string | null;
  paidAt: string | null;
  amount: number | null;
  invoiceNumber: string | null;
  paymentMethod: "card" | "cash" | null;
  clientId: string | null;
  hasLogin: boolean;
  emailProblem: string | null;
  emailedAt: string | null;
  choiceText: string | null;
  packagesMonthly: { name: string; monthly: number }[];
}

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft, not sent", tone: "" },
  sent: { label: "Sent", tone: "pill-info" },
  superseded: { label: "Replaced by a newer version", tone: "" },
  awaiting_payment: { label: "Accepted, not paid yet", tone: "pill-warn" },
  awaiting_cash: { label: "Waiting for cash", tone: "pill-warn" },
  paid: { label: "Paid", tone: "pill-ok" },
};

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function DealView({
  deal,
  versions,
  selectedId,
  report,
  payments,
  acceptance,
  emailOn,
  cardOn,
}: {
  deal: { id: string; business: string; contact: string | null; email: string | null; clientId: string | null; clientName: string | null; status: "open" | "won" | "lost"; notes: string | null };
  versions: DealVersion[];
  selectedId: string | null;
  report: Report | null;
  payments: { method: string; amount: number; kind: string; received_at: string; note: string | null }[];
  acceptance: { email: string; package: string; plan: string; total: number; accepted_at: string; ip: string | null } | null;
  emailOn: boolean;
  cardOn: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ business: deal.business, contact: deal.contact ?? "", email: deal.email ?? "", notes: deal.notes ?? "", status: deal.status });
  const [cash, setCash] = useState<{ amount: string; note: string }>({ amount: "", note: "" });
  const [login, setLogin] = useState<{ email: string; password: string } | null>(null);
  const sel = versions.find((v) => v.id === selectedId) ?? null;

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    start(fn);
  };

  const copyLink = (v: DealVersion) =>
    run(async () => {
      const r = await markSentAction(v.id);
      if (r.error) return setError(r.error);
      const ok = await copy(v.link);
      setFallback(ok ? null : v.link);
      setNotice(ok ? "Link copied. Paste it wherever you're talking to them." : "Copy the link below.");
      router.refresh();
    });

  const copyMessage = (v: DealVersion) =>
    run(async () => {
      const r = await markSentAction(v.id);
      if (r.error) return setError(r.error);
      const text = fill(v.message || "{{link}}", {
        contact: deal.contact?.split(/\s+/)[0] ?? "there",
        business: deal.business,
        link: v.link,
      });
      const ok = await copy(text);
      setFallback(ok ? null : text);
      setNotice(ok ? "Message copied, with the link in it. Paste it into an email from your Advatar address." : "Copy the message below.");
      router.refresh();
    });

  return (
    <div className="pd">
      <header className="pd-head">
        {editing ? (
          <form
            className="card card-pad pd-new"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await saveDealAction(deal.id, form);
                if (r.error) return setError(r.error);
                setEditing(false);
                router.refresh();
              });
            }}
          >
            <div className="pd-grid">
              <label>
                <span className="vm-label">Business name</span>
                <input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} maxLength={160} required />
              </label>
              <label>
                <span className="vm-label">Contact name</span>
                <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} maxLength={120} />
              </label>
              <label>
                <span className="vm-label">Email</span>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} />
              </label>
              <label>
                <span className="vm-label">Deal</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
                  <option value="open">Open</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </label>
            </div>
            <label>
              <span className="vm-label">Notes</span>
              <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={4000} />
            </label>
            <div className="pd-actions">
              <button className="btn btn-primary" disabled={pending}>
                Save
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div>
              <h1 className="page-title page-title-accent" style={{ margin: "0 0 6px" }}>
                {deal.business}
              </h1>
              <p className="pd-meta">
                {deal.contact ?? "No contact name"} · {deal.email ?? "no email yet"}
                {deal.clientId && (
                  <>
                    {" · "}
                    <Link href={`/app/clients/${deal.clientId}`}>existing client{deal.clientName ? `: ${deal.clientName}` : ""}</Link>
                  </>
                )}
                {" · "}
                <span className={`pill ${deal.status === "won" ? "pill-ok" : deal.status === "lost" ? "pill-danger" : ""}`}>{deal.status === "open" ? "Open" : deal.status === "won" ? "Won" : "Lost"}</span>
              </p>
              {deal.notes && <p className="pd-notes">{deal.notes}</p>}
            </div>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Edit details
            </button>
          </>
        )}
      </header>

      {error && <p className="vm-error" role="alert">{error}</p>}
      {notice && (
        <p className="access-note" role="status">
          {notice}
        </p>
      )}
      {fallback && <textarea className="pd-fallback" readOnly rows={fallback.includes("\n") ? 8 : 2} value={fallback} onFocus={(e) => e.currentTarget.select()} />}

      <section className="pd-list" aria-label="Versions">
        <h2>Proposal versions</h2>
        <ul className="pd-versions">
          {versions.map((v) => {
            const st = STATUS[v.status] ?? { label: v.status, tone: "" };
            const locked = Boolean(v.acceptedAt);
            const live = v.status !== "superseded" && v.status !== "paid";
            return (
              <li key={v.id} data-on={v.id === selectedId ? "true" : undefined}>
                <div className="pd-v-top">
                  <Link href={`/app/prospects/deals/${deal.id}?v=${v.id}`} className="pd-v-name" scroll={false}>
                    Version {v.version}
                  </Link>
                  <span className={`pill ${st.tone}`}>{st.label}</span>
                  <span className="pd-v-steps">
                    {v.sentAt && <span>Sent {when(v.sentAt)}</span>}
                    {v.openedAt ? <span>Opened {when(v.openedAt)}</span> : v.sentAt ? <span>Not opened yet</span> : null}
                    {v.finishedAt && <span>Read to the end {when(v.finishedAt)}</span>}
                    {v.acceptedAt && <span>Accepted {when(v.acceptedAt)}</span>}
                    {v.paidAt && <span>Paid {when(v.paidAt)}</span>}
                  </span>
                </div>
                <p className="pd-v-prices">{v.choiceText ?? v.packagesMonthly.map((p) => `${p.name} ${money(p.monthly)}/mo`).join(" · ")}</p>
                <div className="pd-actions">
                  {!locked && v.status !== "superseded" && (
                    <Link className="btn" href={`/app/prospects/proposals/${v.id}/edit`}>
                      Edit
                    </Link>
                  )}
                  <Link className="btn" href={`/app/prospects/proposals/${v.id}/preview`}>
                    Preview
                  </Link>
                  {live && (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => copyLink(v)} disabled={pending}>
                        {v.status === "draft" ? "Create link" : "Copy link"}
                      </button>
                      <button type="button" className="btn" onClick={() => copyMessage(v)} disabled={pending}>
                        Copy message
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const r = await newVersionAction(v.id);
                        if (r.error) return setError(r.error);
                        router.push(`/app/prospects/proposals/${r.proposalId}/edit`);
                      })
                    }
                  >
                    New version from this
                  </button>
                  {v.status === "draft" && (
                    <button
                      type="button"
                      className="vm-link"
                      onClick={() => {
                        if (!window.confirm(`Delete version ${v.version}? It hasn't been sent.`)) return;
                        run(async () => {
                          const r = await deleteDraftAction(v.id);
                          if (r.error) return setError(r.error);
                          router.replace(`/app/prospects/deals/${deal.id}`);
                          router.refresh();
                        });
                      }}
                    >
                      Delete draft
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {sel && (
        <>
          {(sel.acceptedAt || sel.paidAt) && (
            <section className="card card-pad pd-pay" aria-label="Acceptance and payment">
              <h2>Accepted and payment · version {sel.version}</h2>
              <dl className="pd-dl">
                <dt>Chose</dt>
                <dd>{sel.choiceText}</dd>
                <dt>Email</dt>
                <dd>{sel.acceptedEmail}</dd>
                <dt>Due</dt>
                <dd>
                  {sel.amount != null ? money(sel.amount) : "–"} {sel.invoiceNumber && <span className="pd-muted">invoice {sel.invoiceNumber}</span>}
                </dd>
                <dt>Paying by</dt>
                <dd>{sel.paymentMethod === "cash" ? "Cash" : sel.paymentMethod === "card" ? "Card (Stripe)" : "Not chosen yet"}</dd>
                {acceptance && (
                  <>
                    <dt>Contract</dt>
                    <dd>
                      Accepted {when(acceptance.accepted_at)} by {acceptance.email}
                      {acceptance.ip ? ` (from ${acceptance.ip})` : ""} ·{" "}
                      <a href={`${sel.link}/contract`} target="_blank" rel="noreferrer">
                        view
                      </a>{" "}
                      ·{" "}
                      <a href={`${sel.link}/invoice`} target="_blank" rel="noreferrer">
                        invoice
                      </a>
                    </dd>
                  </>
                )}
                <dt>Emailed</dt>
                <dd>{sel.emailedAt ? `Proposal, contract and invoice sent ${when(sel.emailedAt)}` : emailOn ? "Not sent" : "Email isn't set up in the CRM, so send them the contract and invoice links above."}</dd>
              </dl>
              {sel.emailProblem && <p className="access-note">{sel.emailProblem}</p>}

              {payments.length > 0 && (
                <ul className="pd-payments">
                  {payments.map((p, i) => (
                    <li key={i}>
                      <b>{money(p.amount)}</b> {p.method === "cash" ? "cash" : "card"} · {p.kind === "first" ? "first payment" : "monthly"} · {when(p.received_at)}
                      {p.note ? ` · ${p.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}

              {sel.acceptedAt && !sel.paidAt && sel.status !== "superseded" && (
                <form
                  className="pd-cash"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amount = Number(cash.amount || sel.amount || 0);
                    if (!window.confirm(`Note ${money(amount)} cash received from ${deal.business}? This sets them up as a client${deal.clientId ? "" : " and makes their login"}.`)) return;
                    run(async () => {
                      const r = await cashReceivedAction(sel.id, amount, cash.note);
                      if (r.error) return setError(r.error);
                      setNotice(r.loginProblem ? `Cash noted. ${r.loginProblem}` : "Cash noted. They're set up as a client.");
                      router.refresh();
                    });
                  }}
                >
                  <span className="vm-label">{sel.paymentMethod === "cash" ? "They chose cash. Once you have it:" : "Paid in cash instead?"}</span>
                  <div className="pd-cash-row">
                    <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={sel.amount != null ? String(sel.amount) : "Amount"} value={cash.amount} onChange={(e) => setCash({ ...cash, amount: e.target.value })} aria-label="Amount received" />
                    <input placeholder="Note (optional)" value={cash.note} onChange={(e) => setCash({ ...cash, note: e.target.value })} maxLength={500} aria-label="Note" />
                    <button className="btn btn-primary" disabled={pending}>
                      Cash received
                    </button>
                  </div>
                </form>
              )}

              {sel.paidAt && sel.paymentMethod === "cash" && (
                <form
                  className="pd-cash"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const amount = Number(cash.amount);
                    if (!(amount > 0)) return setError("Enter the amount received.");
                    run(async () => {
                      const r = await cashReceivedAction(sel.id, amount, cash.note);
                      if (r.error) return setError(r.error);
                      setCash({ amount: "", note: "" });
                      setNotice("Monthly cash payment noted.");
                      router.refresh();
                    });
                  }}
                >
                  <span className="vm-label">Note a monthly cash payment</span>
                  <div className="pd-cash-row">
                    <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Amount" value={cash.amount} onChange={(e) => setCash({ ...cash, amount: e.target.value })} aria-label="Amount received" />
                    <input placeholder="Note (optional)" value={cash.note} onChange={(e) => setCash({ ...cash, note: e.target.value })} maxLength={500} aria-label="Note" />
                    <button className="btn" disabled={pending}>
                      Cash received
                    </button>
                  </div>
                </form>
              )}

              {sel.paidAt && (
                <div className="pd-actions">
                  {sel.clientId ? (
                    <Link className="btn btn-primary" href={`/app/clients/${sel.clientId}?tab=info`}>
                      Open the client
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await finishSetupAction(sel.id);
                          if (r.error) return setError(r.error);
                          setNotice(r.loginProblem ?? "Client set up.");
                          router.refresh();
                        })
                      }
                    >
                      Finish setting them up
                    </button>
                  )}
                  {sel.hasLogin && (
                    <button
                      type="button"
                      className="btn"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm("Make a new temporary password for their login? Any password they've set will stop working.")) return;
                        run(async () => {
                          const r = await clientLoginDetailsAction(sel.id);
                          if (r.error) return setError(r.error);
                          setLogin({ email: r.email!, password: r.password! });
                        });
                      }}
                    >
                      Get login details
                    </button>
                  )}
                </div>
              )}
              {login && (
                <p className="access-note">
                  Login: <b>{login.email}</b> · temporary password <b>{login.password}</b>. They change it at Settings, Password after signing in.
                </p>
              )}
              {!cardOn && sel.acceptedAt && !sel.paidAt && <p className="pd-muted">Card payments aren&rsquo;t switched on yet (Stripe), so clients only see the cash option.</p>}
            </section>
          )}

          {report && <Tracking report={report} version={sel.version} />}
        </>
      )}
    </div>
  );
}

function Tracking({ report, version }: { report: Report; version: number }) {
  if (!report.opened) {
    return (
      <section className="card card-pad pd-track" aria-label="What they looked at">
        <h2>What they looked at · version {version}</h2>
        <p className="pd-muted">Not opened yet. You&rsquo;ll see everything they do here as soon as they open the link.</p>
      </section>
    );
  }
  const max = Math.max(1, ...report.pages.map((p) => p.ms));
  const pmax = Math.max(1, ...report.packages.map((p) => p.ms));
  return (
    <section className="card card-pad pd-track" aria-label="What they looked at">
      <h2>What they looked at · version {version}</h2>
      <div className="pd-stats">
        <div>
          <span>Read it all?</span>
          <b className={report.readAll ? "pd-yes" : "pd-no"}>{report.readAll ? "Yes" : "Not yet"}</b>
          <small>
            {report.progress.seen} of {report.progress.of} pages of {report.progress.packageLabel}
            {report.reachedEnd ? ", reached the total" : ""}
          </small>
        </div>
        <div>
          <span>Time spent</span>
          <b>{duration(report.totalMs)}</b>
          <small>
            {report.visits} visit{report.visits === 1 ? "" : "s"}
            {report.devices.length ? ` · ${report.devices.join(", ")}` : ""}
          </small>
        </div>
        <div>
          <span>Most time on</span>
          <b>{report.topPage ?? "–"}</b>
          <small>{report.lastAt ? `last seen ${when(report.lastAt)}` : ""}</small>
        </div>
        <div>
          <span>Contract</span>
          <b>{report.contract.opened ? "Opened" : "Not opened"}</b>
          <small>{report.contract.opened ? `read for ${duration(report.contract.ms)}` : ""}</small>
        </div>
      </div>

      <h3>Packages they looked at</h3>
      <ul className="pd-bars">
        {report.packages.map((p) => (
          <li key={p.id}>
            <span>
              {p.label}
              {!p.picked && <i> (not opened)</i>}
            </span>
            <span className="pd-bar">
              <span style={{ width: `${(p.ms / pmax) * 100}%` }} />
            </span>
            <b>{duration(p.ms)}</b>
          </li>
        ))}
      </ul>

      <h3>Time on each page</h3>
      <ul className="pd-bars">
        {report.pages.map((p) => (
          <li key={p.id} data-top={p.label === report.topPage ? "true" : undefined}>
            <span>
              {p.label}
              {!p.seen && <i> (not seen)</i>}
            </span>
            <span className="pd-bar">
              <span style={{ width: `${(p.ms / max) * 100}%` }} />
            </span>
            <b>{p.seen ? duration(p.ms) : "–"}</b>
          </li>
        ))}
      </ul>

      <dl className="pd-dl">
        <dt>Breakdowns read</dt>
        <dd>{report.breakdowns.length ? report.breakdowns.join(", ") : "None yet"}</dd>
        <dt>Extras added</dt>
        <dd>{report.extras.length ? report.extras.map((x) => `${x.label} × ${x.qty}`).join(", ") : "None"}</dd>
        <dt>Monthly or upfront</dt>
        <dd>{report.plans.length ? report.plans.map((p) => (p === "upfront" ? "looked at 3 months upfront" : "looked at monthly")).join(", ") : "Didn't switch"}</dd>
        <dt>Got to</dt>
        <dd>{report.method ? `Chose ${report.method}` : report.letsGo ? "Pressed Let's go" : report.reachedEnd ? "The total, didn't press Let's go" : "Partway through"}</dd>
      </dl>
    </section>
  );
}
