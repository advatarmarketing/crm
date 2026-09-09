"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { EventCategory } from "./SchedulePanel";

/**
 * Add, rename, recolour and remove the calendar's event types.
 *
 * Writes go through the browser client, so `event_categories`' RLS
 * (0019) decides who may change things — staff, operations manager
 * and CEO can, videographers can only read. The page that mounts this
 * checks the role too, so a videographer never sees the controls.
 *
 * Deleting a category leaves its events in place: schedule_events
 * .category_id is `on delete set null`, and anything without a
 * category renders in the fallback grey rather than disappearing.
 */
export function EventCategoriesEditor({ initialCategories }: { initialCategories: EventCategory[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  // A literal hex, not a token: <input type="color"> only accepts a
  // concrete value. Matches --chart-2 so a new category lands in the
  // same family as the seeded ones.
  const [colour, setColour] = useState("#6b8aa6");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("event_categories")
      .insert({ name: name.trim(), colour, position: categories.length + 1 })
      .select("id, name, colour")
      .single();

    setBusy(false);

    if (insertError || !data) {
      setError(
        /duplicate|unique/i.test(insertError?.message ?? "")
          ? "There's already a category with that name."
          : insertError?.message ?? "Could not add that."
      );
      return;
    }

    setCategories((prev) => [...prev, data as EventCategory]);
    setName("");
    setColour("#6b8aa6");
    router.refresh();
  }

  async function update(id: string, patch: Partial<EventCategory>) {
    const prev = categories;
    setCategories((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))); // optimistic

    const { error: updateError } = await supabase.from("event_categories").update(patch).eq("id", id);
    if (updateError) {
      setCategories(prev);
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    const prev = categories;
    setCategories((cs) => cs.filter((c) => c.id !== id)); // optimistic

    const { error: deleteError } = await supabase.from("event_categories").delete().eq("id", id);
    if (deleteError) {
      setCategories(prev);
      setError(deleteError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <ul style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} onUpdate={update} onRemove={remove} />
        ))}
      </ul>

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, margin: "0 0 12px" }}>{error}</p>}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          paddingTop: 18,
          borderTop: "1px solid var(--border)",
        }}
      >
        <input
          type="color"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          aria-label="Colour for the new category"
          style={swatch}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="New category, e.g. Client review"
          style={{ ...field, flex: "1 1 200px" }}
        />
        <button type="button" onClick={add} disabled={busy || !name.trim()} className="btn">
          {busy ? "Adding…" : "Add category"}
        </button>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  onUpdate,
  onRemove,
}: {
  category: EventCategory;
  onUpdate: (id: string, patch: Partial<EventCategory>) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(category.name);
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${category.colour}`,
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
      }}
    >
      <input
        type="color"
        value={category.colour}
        onChange={(e) => onUpdate(category.id, { colour: e.target.value })}
        aria-label={`Colour for ${category.name}`}
        style={swatch}
      />

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const trimmed = name.trim();
          if (trimmed && trimmed !== category.name) onUpdate(category.id, { name: trimmed });
          else setName(category.name);
        }}
        aria-label={`Name for ${category.name}`}
        style={{ ...field, flex: "1 1 180px" }}
      />

      {confirming ? (
        <>
          <button type="button" onClick={() => onRemove(category.id)} className="btn btn-primary">
            Yes, delete
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="btn">
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${category.name}`}
          title="Delete"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-3)",
            cursor: "pointer",
            padding: 4,
            lineHeight: 0,
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      )}

      {confirming && (
        <p style={{ flexBasis: "100%", margin: "6px 0 0", fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-2)" }}>
          Events already using this category keep their date and title — they
          just lose the colour and label until you give them another one.
        </p>
      )}
    </li>
  );
}

const field = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  minWidth: 0,
};

const swatch = {
  width: 38,
  height: 34,
  padding: 2,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  cursor: "pointer",
  flexShrink: 0,
};
