"use client";

import { useState, useTransition } from "react";
import { deleteTemplateAction, renameTemplateAction } from "@/app/app/prospects/proposal-actions";

/** The pre-saves. Made from the editor ("Save as template"); renamed and removed here. */
export function TemplatesPanel({
  templates,
  canManageAll,
  me,
}: {
  templates: { id: string; name: string; created_by: string | null; updated_at: string }[];
  canManageAll: boolean;
  me: string | null;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="pd-list" aria-label="Templates">
      <h2>Templates</h2>
      <p className="pd-empty">
        Pre-saves to start a proposal from. Make one from any proposal with &ldquo;Save as template&rdquo;. &ldquo;Advatar standard&rdquo; is always there.
      </p>
      {templates.length > 0 && (
        <ul className="pd-tpls">
          {templates.map((t) => {
            const mine = canManageAll || t.created_by === me;
            return (
              <li key={t.id}>
                {editing === t.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      start(async () => {
                        const r = await renameTemplateAction(t.id, name);
                        setError(r.error);
                        if (!r.error) setEditing(null);
                      });
                    }}
                  >
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus aria-label="Template name" />
                    <button className="btn btn-primary" disabled={pending}>
                      Save
                    </button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <b>{t.name}</b>
                    <span>updated {new Date(t.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    {mine && (
                      <span className="pd-tpl-actions">
                        <button
                          type="button"
                          className="vm-link"
                          onClick={() => {
                            setEditing(t.id);
                            setName(t.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="vm-link"
                          onClick={() => {
                            if (!window.confirm(`Delete the template "${t.name}"? Proposals already made from it are not affected.`)) return;
                            start(async () => setError((await deleteTemplateAction(t.id)).error));
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="vm-error" role="alert">{error}</p>}
    </section>
  );
}
