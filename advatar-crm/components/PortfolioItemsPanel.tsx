"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ClientChoice } from "./SchedulePanel";

export interface ManualPortfolioItem {
  id: string;
  title: string;
  url: string | null;
  client_id: string | null;
  client_label: string | null;
  completed_on: string | null;
  notes: string | null;
}

/**
 * Work added by hand — a showreel, a piece shot before this CRM
 * existed, something made for somebody who was never a client here.
 *
 * Kept as its own table (0025) rather than faking an approved
 * submission: this work never went through the review workflow and
 * shouldn't pretend it did. It still shows in the gallery above
 * alongside approved submissions, marked as added by hand.
 *
 * Writes go through the browser client, so `portfolio_items`' RLS
 * ("own rows") is what decides whether an edit is allowed.
 */
export function PortfolioItemsPanel({
  initialItems,
  clients = [],
}: {
  initialItems: ManualPortfolioItem[];
  clients?: ClientChoice[];
}) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  async function remove(id: string) {
    const prev = items;
    setItems((list) => list.filter((i) => i.id !== id)); // optimistic
    const { error: deleteError } = await supabase.from("portfolio_items").delete().eq("id", id);
    if (deleteError) {
      setItems(prev);
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {items.length === 0 && !adding ? (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 12px" }}>
          Nothing added by hand yet. Use this for older work, showreels, or
          anything shot before you joined.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id}>
                <ItemForm
                  clients={clients}
                  initial={item}
                  onCancel={() => setEditingId(null)}
                  onSaved={(saved) => {
                    setItems((list) => list.map((i) => (i.id === saved.id ? saved : i)));
                    setEditingId(null);
                    router.refresh();
                  }}
                />
              </li>
            ) : (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "12px 14px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-1)" }}>
                    {item.title}
                  </span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>
                    {[
                      clients.find((c) => c.id === item.client_id)?.name ?? item.client_label,
                      item.completed_on
                        ? new Date(item.completed_on).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No client or date"}
                  </span>
                </span>

                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ textDecoration: "none" }}>
                      Watch ↗
                    </a>
                  )}
                  <button type="button" className="btn" onClick={() => setEditingId(item.id)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => remove(item.id)}>
                    Remove
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      )}

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {adding ? (
        <ItemForm
          clients={clients}
          onCancel={() => setAdding(false)}
          onSaved={(saved) => {
            setItems((list) => [saved, ...list]);
            setAdding(false);
            router.refresh();
          }}
        />
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          + Add work to your portfolio
        </button>
      )}
    </div>
  );
}

/** Add and edit share a form: the fields and validation are identical. */
function ItemForm({
  clients,
  initial,
  onCancel,
  onSaved,
}: {
  clients: ClientChoice[];
  initial?: ManualPortfolioItem;
  onCancel: () => void;
  onSaved: (item: ManualPortfolioItem) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [clientLabel, setClientLabel] = useState(initial?.client_label ?? "");
  const [completedOn, setCompletedOn] = useState(initial?.completed_on ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function save() {
    if (!title.trim()) return setError("Give it a title.");
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
      return setError("The link should start with http:// or https://");
    }

    setBusy(true);
    setError(null);

    const payload = {
      title: title.trim(),
      url: url.trim() || null,
      client_id: clientId || null,
      // Only kept when there's no real client to point at — otherwise
      // the two would drift apart the moment a client is renamed.
      client_label: clientId ? null : clientLabel.trim() || null,
      completed_on: completedOn || null,
      notes: notes.trim() || null,
    };

    const query = initial
      ? supabase.from("portfolio_items").update(payload).eq("id", initial.id)
      : supabase.from("portfolio_items").insert(payload);

    const { data, error: saveError } = await query
      .select("id, title, url, client_id, client_label, completed_on, notes")
      .single();

    setBusy(false);

    if (saveError || !data) {
      return setError(saveError?.message ?? "Could not save that.");
    }

    onSaved(data as unknown as ManualPortfolioItem);
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-2)",
      }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What is it? e.g. Showreel 2025"
        style={{ ...field, width: "100%", marginBottom: 10 }}
      />

      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Link to watch it (optional)"
        style={{ ...field, width: "100%", marginBottom: 10 }}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {clients.length > 0 && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            aria-label="Client"
            style={{ ...field, flex: "1 1 160px" }}
          >
            <option value="">Not a client here</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {!clientId && (
          <input
            value={clientLabel}
            onChange={(e) => setClientLabel(e.target.value)}
            placeholder="Who was it for? (optional)"
            style={{ ...field, flex: "1 1 160px" }}
          />
        )}

        <input
          type="date"
          value={completedOn}
          onChange={(e) => setCompletedOn(e.target.value)}
          title="When it was finished"
          style={{ ...field, flex: "1 1 150px" }}
        />
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="A line about it (optional)"
        style={{ ...field, width: "100%", resize: "vertical", marginBottom: 12 }}
      />

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary">
          {busy ? "Saving…" : initial ? "Save changes" : "Add to portfolio"}
        </button>
        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
      </div>
    </div>
  );
}

const field = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  minWidth: 0,
};
