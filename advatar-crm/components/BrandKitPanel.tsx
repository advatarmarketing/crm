"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface BrandKit {
  client_id: string;
  colours: string[];
  fonts: string[];
  platforms: string[];
  logo_urls: string[];
  tone_of_voice: string | null;
  dos: string | null;
  donts: string | null;
}

export function emptyBrandKit(clientId: string): BrandKit {
  return {
    client_id: clientId,
    colours: [],
    fonts: [],
    platforms: [],
    logo_urls: [],
    tone_of_voice: null,
    dos: null,
    donts: null,
  };
}

/**
 * A client's brand kit: logos, colours, fonts, tone of voice,
 * platforms and dos/don'ts.
 *
 * `editable` is set for the people who own the brand (management and
 * assigned staff) and false for videographers, matching
 * client_brand_kits' RLS in 0020 — they read it while shooting, they
 * don't write it.
 *
 * Saves with upsert on client_id: the row is created the first time
 * anyone fills anything in, so nothing has to pre-create an empty kit
 * for every client.
 */
export function BrandKitPanel({
  initialKit,
  editable = false,
}: {
  initialKit: BrandKit;
  editable?: boolean;
}) {
  const [kit, setKit] = useState(initialKit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  async function save(patch: Partial<BrandKit>) {
    const next = { ...kit, ...patch };
    setKit(next);
    setBusy(true);
    setError(null);
    setSaved(false);

    const { error: saveError } = await supabase.from("client_brand_kits").upsert(
      {
        client_id: kit.client_id,
        colours: next.colours,
        fonts: next.fonts,
        platforms: next.platforms,
        logo_urls: next.logo_urls,
        tone_of_voice: next.tone_of_voice,
        dos: next.dos,
        donts: next.donts,
      },
      { onConflict: "client_id" }
    );

    setBusy(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  const isEmpty =
    kit.colours.length === 0 &&
    kit.fonts.length === 0 &&
    kit.platforms.length === 0 &&
    kit.logo_urls.length === 0 &&
    !kit.tone_of_voice &&
    !kit.dos &&
    !kit.donts;

  if (!editable && isEmpty) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
        No brand kit set up for this client yet — ask your account manager to
        fill it in.
      </p>
    );
  }

  return (
    <div>
      {/* Logos */}
      <Block label="Logos">
        {kit.logo_urls.length === 0 && !editable && <Muted>None added.</Muted>}
        {kit.logo_urls.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: editable ? 10 : 0 }}>
            {kit.logo_urls.map((url) => (
              <span
                key={url}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 96,
                  height: 72,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", lineHeight: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Client logo"
                    style={{ maxWidth: 92, maxHeight: 68, objectFit: "contain" }}
                  />
                </a>
                {editable && (
                  <button
                    type="button"
                    onClick={() => save({ logo_urls: kit.logo_urls.filter((u) => u !== url) })}
                    aria-label="Remove logo"
                    style={removeBadge}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {editable && (
          <AddText
            placeholder="Paste a logo image link (https://…)"
            onAdd={(value) => {
              if (!/^https?:\/\//i.test(value)) {
                setError("The logo link should start with http:// or https://");
                return false;
              }
              save({ logo_urls: [...kit.logo_urls, value] });
              return true;
            }}
          />
        )}
      </Block>

      {/* Colours */}
      <Block label="Colours">
        {kit.colours.length === 0 && !editable && <Muted>None set.</Muted>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: editable ? 10 : 0 }}>
          {kit.colours.map((c) => (
            <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  background: c,
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              />
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-2)", userSelect: "all" }}>
                {c}
              </code>
              {editable && (
                <button
                  type="button"
                  onClick={() => save({ colours: kit.colours.filter((x) => x !== c) })}
                  aria-label={`Remove ${c}`}
                  style={inlineRemove}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {editable && (
          <AddText
            placeholder="#1A2B3C or 'Warm cream'"
            onAdd={(value) => {
              save({ colours: [...kit.colours, value] });
              return true;
            }}
          />
        )}
      </Block>

      {/* Fonts */}
      <Block label="Fonts">
        {kit.fonts.length === 0 && !editable && <Muted>None set.</Muted>}
        <ChipList
          items={kit.fonts}
          editable={editable}
          onRemove={(f) => save({ fonts: kit.fonts.filter((x) => x !== f) })}
        />
        {editable && (
          <AddText
            placeholder="Font name, e.g. Bebas Neue (headings)"
            onAdd={(value) => {
              save({ fonts: [...kit.fonts, value] });
              return true;
            }}
          />
        )}
      </Block>

      {/* Platforms */}
      <Block label="Platforms">
        {kit.platforms.length === 0 && !editable && <Muted>None set.</Muted>}
        <ChipList
          items={kit.platforms}
          editable={editable}
          onRemove={(p) => save({ platforms: kit.platforms.filter((x) => x !== p) })}
        />
        {editable && (
          <AddText
            placeholder="Instagram, TikTok, LinkedIn…"
            onAdd={(value) => {
              save({ platforms: [...kit.platforms, value] });
              return true;
            }}
          />
        )}
      </Block>

      <Block label="Tone of voice">
        <LongText
          value={kit.tone_of_voice}
          editable={editable}
          placeholder="How this brand sounds — and how it doesn't."
          onSave={(v) => save({ tone_of_voice: v })}
        />
      </Block>

      <Block label="Do">
        <LongText
          value={kit.dos}
          editable={editable}
          placeholder="Always shoot vertical. Keep captions under 8 words."
          onSave={(v) => save({ dos: v })}
        />
      </Block>

      <Block label="Don't">
        <LongText
          value={kit.donts}
          editable={editable}
          placeholder="Never use the old logo. No stock music."
          onSave={(v) => save({ donts: v })}
        />
      </Block>

      {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5, marginTop: 8 }}>{error}</p>}
      {editable && (busy || saved) && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
          {busy ? "Saving…" : "Saved"}
        </p>
      )}
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <span
        style={{
          display: "block",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 8,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: 0 }}>{children}</p>;
}

function ChipList({
  items,
  editable,
  onRemove,
}: {
  items: string[];
  editable: boolean;
  onRemove: (item: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: editable ? 10 : 0 }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-1)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "5px 11px",
            background: "var(--surface)",
          }}
        >
          {item}
          {editable && (
            <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item}`} style={inlineRemove}>
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function AddText({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  /** Return false to keep the text in the box (validation failed). */
  onAdd: (value: string) => boolean;
}) {
  const [value, setValue] = useState("");

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (onAdd(trimmed)) setValue("");
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
        style={{ ...field, flex: "1 1 220px" }}
      />
      <button type="button" onClick={commit} disabled={!value.trim()} className="btn" style={{ flexShrink: 0 }}>
        Add
      </button>
    </div>
  );
}

function LongText({
  value,
  editable,
  placeholder,
  onSave,
}: {
  value: string | null;
  editable: boolean;
  placeholder: string;
  onSave: (value: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");

  if (!editable) {
    if (!value?.trim()) return <Muted>Not set.</Muted>;
    return (
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          color: "var(--text-1)",
          margin: 0,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </p>
    );
  }

  return (
    <textarea
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim() || null;
        if (next !== (value ?? null)) onSave(next);
      }}
      rows={3}
      placeholder={placeholder}
      style={{ ...field, width: "100%", resize: "vertical" }}
    />
  );
}

const field = {
  padding: "9px 11px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-1)",
  fontFamily: "var(--font-body)",
  fontSize: 13.5,
  minWidth: 0,
};

const inlineRemove = {
  background: "none",
  border: "none",
  color: "var(--text-3)",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  padding: "0 2px",
};

const removeBadge = {
  position: "absolute" as const,
  top: 2,
  right: 2,
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-2)",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
};
