"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDealAction } from "@/app/app/prospects/proposal-actions";

/** Starting a new proposal: who it's for, and which pre-save to start from. */
export function NewProposalForm({ templates, clients }: { templates: { id: string; name: string }[]; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState(false);
  const [business, setBusiness] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="pd-new-row">
        <button type="button" className="btn btn-accent" onClick={() => setOpen(true)}>
          + New proposal
        </button>
      </div>
    );
  }

  return (
    <form
      className="card card-pad pd-new"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createDealAction({ business, contact, email, clientId: existing ? clientId || null : null, templateId: templateId || null });
          if (r.error) return setError(r.error);
          router.push(`/app/prospects/proposals/${r.proposalId}/edit`);
        });
      }}
    >
      <h2>New proposal</h2>
      <div className="seg" role="group" aria-label="Who it's for">
        <button type="button" className={!existing ? "on" : ""} onClick={() => setExisting(false)}>
          A new business
        </button>
        <button type="button" className={existing ? "on" : ""} onClick={() => setExisting(true)}>
          An existing client
        </button>
      </div>
      <div className="pd-grid">
        {existing ? (
          <label>
            <span className="vm-label">Client</span>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span className="vm-label">Business name</span>
            <input value={business} onChange={(e) => setBusiness(e.target.value)} required maxLength={160} placeholder="e.g. Glow Dental" />
          </label>
        )}
        <label>
          <span className="vm-label">Contact name</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} placeholder="Who you've been talking to" />
        </label>
        <label>
          <span className="vm-label">Email (if you have it)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="Optional" />
        </label>
        <label>
          <span className="vm-label">Start from</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Advatar standard (3 packages)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="vm-error" role="alert">{error}</p>}
      <div className="pd-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create and edit"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
