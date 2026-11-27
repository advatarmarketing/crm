"use client";

import { useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EnquiryFlow } from "@/app/enquire/EnquiryFlow";
import { playerFor } from "@/lib/video-links";
import { mediaKind, newId, type VslCase, type VslContent, type VslLinkSection } from "@/lib/vsl";
import { evenOutLogo } from "@/lib/vsl-logo";
import { saveVslAction, uploadVslLogoAction } from "./actions";

/**
 * The VSL page. Visitors see it as it is; the CEO and operations, when
 * signed in, get a bar at the top to edit it in place: every heading
 * and paragraph becomes a box to type in, and the logos and case
 * studies get their add, move and remove buttons. Nothing changes for
 * visitors until Save.
 */

const FORM_ID = "vsl-form";

function toForm() {
  document.getElementById(FORM_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function VslPage({ initial, canEdit, ready }: { initial: VslContent; canEdit: boolean; ready: boolean }) {
  const [saved, setSaved] = useState<VslContent>(initial);
  const [draft, setDraft] = useState<VslContent>(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const c = editing ? draft : saved;

  function patch(p: Partial<VslContent>) {
    setDraft((d) => ({ ...d, ...p }));
    setNotice(null);
  }
  function patchSection(key: "next" | "about" | "work", p: Partial<VslLinkSection>) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...p } }));
  }

  async function save() {
    setBusy("Saving…");
    setError(null);
    const res = await saveVslAction(draft).catch(() => ({ error: "That didn’t save. Check your connection and try again.", content: undefined }));
    setBusy(null);
    if (res.error || !res.content) return setError(res.error ?? "That didn’t save.");
    setSaved(res.content);
    setDraft(res.content);
    setEditing(false);
    setNotice("Saved. Visitors now see these changes.");
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <div className="vsl">
      {canEdit && (
        <div className="vsl-editbar" role="region" aria-label="Edit this page">
          {editing ? (
            <>
              <span>
                <strong>Editing.</strong> Visitors see your changes once you save.
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={() => { setDraft(saved); setEditing(false); setError(null); }} disabled={Boolean(busy)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={Boolean(busy) || !changed}>
                {busy ?? "Save changes"}
              </button>
            </>
          ) : (
            <>
              <span>
                {ready ? "You can edit this page." : "Run database update 0062 in Supabase to save changes to this page."}
                {notice ? ` ${notice}` : ""}
              </span>
              <span style={{ flex: 1 }} />
              <a href="/app/dashboard" className="vm-link">
                Back to the CRM
              </a>
              <button type="button" className="btn btn-primary" onClick={() => { setDraft(saved); setEditing(true); setNotice(null); }}>
                Edit page
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="vsl-editbar-error">
              {error}
            </p>
          )}
        </div>
      )}

      <header className="vsl-top">
        <Logo height={34} variant="full" />
        <ThemeToggle size={28} />
      </header>

      {/* 1. The pitch */}
      <section className="vsl-hero">
        <Edit editing={editing} as="h1" className="vsl-title" value={c.title} onChange={(v) => patch({ title: v })} label="Title" />
        <Edit editing={editing} as="p" multiline className="vsl-sub" value={c.subheading} onChange={(v) => patch({ subheading: v })} label="Subheading" />

        {editing ? (
          <label className="vsl-field">
            <span>Video link (Cloudinary)</span>
            <input value={c.video_url} onChange={(e) => patch({ video_url: e.target.value })} placeholder="https://res.cloudinary.com/…/video/upload/…" />
          </label>
        ) : null}
        <Media url={c.video_url} wide placeholder={editing ? "Paste the video link above to show it here." : null} />

        <div className="vsl-proof">
          {editing ? (
            <>
              <label className="vsl-check">
                <input type="checkbox" checked={c.show_stars} onChange={(e) => patch({ show_stars: e.target.checked })} /> Show the five stars
              </label>
              <label className="vsl-field">
                <span>Proof, next to the stars</span>
                <input value={c.proof_headline} onChange={(e) => patch({ proof_headline: e.target.value })} />
              </label>
              <label className="vsl-field">
                <span>Proof, the small line</span>
                <input value={c.proof_line} onChange={(e) => patch({ proof_line: e.target.value })} />
              </label>
            </>
          ) : (
            <>
              {(c.show_stars || c.proof_headline) && (
                <p className="vsl-proof-top">
                  {c.show_stars && (
                    <span className="vsl-stars" aria-label="Five stars">
                      ★★★★★
                    </span>
                  )}
                  {c.proof_headline && <strong>{c.proof_headline}</strong>}
                </p>
              )}
              {c.proof_line && <p className="vsl-proof-line">{c.proof_line}</p>}
            </>
          )}
        </div>
      </section>

      {/* 2. The form */}
      <section id={FORM_ID} className="vsl-form">
        <Edit editing={editing} as="h2" className="vsl-h2 vsl-center" value={c.form_heading} onChange={(v) => patch({ form_heading: v })} label="Heading above the form" />
        <EnquiryFlow embedded source="vsl" />
      </section>

      {/* 3. Logos */}
      {(editing || c.logos.length > 0) && (
        <section className="vsl-logos">
          <Edit editing={editing} as="h2" className="vsl-logos-head" value={c.logos_heading} onChange={(v) => patch({ logos_heading: v })} label="Heading above the logos" />
          {c.logos.length > 0 && <LogoStrip logos={c.logos} />}
          {editing && <LogoManager logos={c.logos} onChange={(logos) => patch({ logos })} />}
        </section>
      )}

      {/* 4. Case studies and testimonials */}
      {(editing || c.cases.length > 0) && (
        <section className="vsl-section">
          <Edit editing={editing} as="h2" className="vsl-h2 vsl-center" value={c.cases_heading} onChange={(v) => patch({ cases_heading: v })} label="Heading above the case studies" />
          {editing && (
            <div className="vsl-edit-row">
              <label className="vsl-field">
                <span>Text beside the button under each one</span>
                <input value={c.case_cta_text} onChange={(e) => patch({ case_cta_text: e.target.value })} />
              </label>
              <label className="vsl-field">
                <span>Button</span>
                <input value={c.case_cta_button} onChange={(e) => patch({ case_cta_button: e.target.value })} />
              </label>
            </div>
          )}
          <div className="vsl-cases">
            {c.cases.map((item, i) => (
              <CaseCard
                key={item.id}
                item={item}
                editing={editing}
                ctaText={c.case_cta_text}
                ctaButton={c.case_cta_button}
                onChange={(p) => patch({ cases: c.cases.map((x) => (x.id === item.id ? { ...x, ...p } : x)) })}
                onMove={(dir) => patch({ cases: move(c.cases, i, dir) })}
                onRemove={() => patch({ cases: c.cases.filter((x) => x.id !== item.id) })}
                first={i === 0}
                last={i === c.cases.length - 1}
              />
            ))}
          </div>
          {editing && (
            <div className="vsl-add">
              <button type="button" className="btn" onClick={() => patch({ cases: [...c.cases, blankCase("case_study")] })}>
                + Add a case study
              </button>
              <button type="button" className="btn" onClick={() => patch({ cases: [...c.cases, blankCase("testimonial")] })}>
                + Add a testimonial
              </button>
            </div>
          )}
        </section>
      )}

      {/* 5–7. Where to go next on the main website */}
      {(["next", "about", "work"] as const).map((key) => (
        <LinkBlock key={key} section={c[key]} editing={editing} onChange={(p) => patchSection(key, p)} />
      ))}

      {/* 8. Back to the form */}
      <section className="vsl-final">
        <Edit editing={editing} as="h2" className="vsl-h2" value={c.final_heading} onChange={(v) => patch({ final_heading: v })} label="Last heading" />
        {editing ? (
          <label className="vsl-field" style={{ maxWidth: 320, margin: "0 auto" }}>
            <span>Button</span>
            <input value={c.final_button} onChange={(e) => patch({ final_button: e.target.value })} />
          </label>
        ) : (
          <button type="button" className="vsl-btn" onClick={toForm}>
            {c.final_button || "Fill in the form"}
          </button>
        )}
      </section>
    </div>
  );
}

// =================================================================
// Pieces
// =================================================================

/** A piece of text that turns into a box to type in while editing. */
function Edit({
  editing,
  as: Tag,
  value,
  onChange,
  label,
  className,
  multiline = false,
}: {
  editing: boolean;
  as: "h1" | "h2" | "h3" | "p";
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
  multiline?: boolean;
}) {
  if (editing) {
    return multiline ? (
      <textarea aria-label={label} placeholder={label} className={`vsl-input ${className ?? ""}`} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input aria-label={label} placeholder={label} className={`vsl-input ${className ?? ""}`} value={value} onChange={(e) => onChange(e.target.value)} />
    );
  }
  if (!value.trim()) return null;
  return <Tag className={className}>{value}</Tag>;
}

/** A Cloudinary (or YouTube, Vimeo…) video, or a picture. */
function Media({ url, wide = false, placeholder }: { url: string; wide?: boolean; placeholder?: string | null }) {
  const kind = mediaKind(url);
  if (!kind) return placeholder ? <div className="vsl-media vsl-media--empty">{placeholder}</div> : null;
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="vsl-media vsl-media--img" loading="lazy" />;
  }
  const src = playerFor(null, url);
  if (!src) return null;
  if (src.kind === "native") {
    return <video src={src.src} controls playsInline preload="metadata" className={`vsl-media ${wide ? "is-wide" : ""}`} />;
  }
  if (src.kind === "frame") {
    return (
      <iframe
        src={src.src}
        title="Video"
        loading="lazy"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        className={`vsl-media is-frame ${wide ? "is-wide" : ""}`}
      />
    );
  }
  return (
    <a href={src.href} target="_blank" rel="noopener noreferrer" className="vsl-btn vsl-btn--quiet">
      Watch the video ↗
    </a>
  );
}

/** The moving strip of logos. Doubled so it loops without a seam. */
function LogoStrip({ logos }: { logos: VslContent["logos"] }) {
  // Enough copies that the strip is always wider than the screen.
  const copies = Math.max(2, Math.ceil(12 / logos.length) * 2);
  const run = Array.from({ length: copies }, () => logos).flat();
  return (
    <div className="vsl-marquee" aria-label={logos.map((l) => l.name).filter(Boolean).join(", ")}>
      <div className="vsl-marquee-track" style={{ animationDuration: `${Math.max(20, logos.length * 6)}s` }}>
        {run.map((l, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${l.id}-${i}`} src={l.url} alt={i < logos.length ? l.name : ""} aria-hidden={i >= logos.length} className="vsl-logo" loading="lazy" />
        ))}
      </div>
    </div>
  );
}

function LogoManager({ logos, onChange }: { logos: VslContent["logos"]; onChange: (l: VslContent["logos"]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const added: VslContent["logos"] = [];
    let i = 0;
    for (const file of Array.from(files)) {
      i++;
      setBusy(`Evening out ${i} of ${files.length}…`);
      try {
        const { dataUrl } = await evenOutLogo(file);
        const res = await uploadVslLogoAction(dataUrl);
        if (res.error || !res.url) {
          setError(`${file.name}: ${res.error ?? "didn’t upload"}`);
          continue;
        }
        added.push({ id: newId("logo"), name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(), url: res.url });
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "couldn’t be read"}`);
      }
    }
    setBusy(null);
    if (added.length) onChange([...logos, ...added]);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="vsl-logo-manager">
      <p className="vsl-hint">
        Upload any logo: PNG, JPG, SVG or WebP, on any background. Each one is turned into the same light shape at the same height, so the strip looks
        even. Transparent PNGs come out best.
      </p>
      <div className="vsl-logo-grid">
        {logos.map((l, i) => (
          <div key={l.id} className="vsl-logo-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.url} alt="" className="vsl-logo" />
            <input aria-label="Business name" value={l.name} placeholder="Business name" onChange={(e) => onChange(logos.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))} />
            <div className="vsl-tile-actions">
              <button type="button" onClick={() => onChange(move(logos, i, -1))} disabled={i === 0} aria-label="Move left">
                ←
              </button>
              <button type="button" onClick={() => onChange(move(logos, i, 1))} disabled={i === logos.length - 1} aria-label="Move right">
                →
              </button>
              <button type="button" onClick={() => onChange(logos.filter((x) => x.id !== l.id))} aria-label={`Remove ${l.name || "logo"}`}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={Boolean(busy)}>
        {busy ?? "+ Upload logos"}
      </button>
      {error && (
        <p role="alert" className="vsl-error">
          {error}
        </p>
      )}
    </div>
  );
}

function CaseCard({
  item,
  editing,
  ctaText,
  ctaButton,
  onChange,
  onMove,
  onRemove,
  first,
  last,
}: {
  item: VslCase;
  editing: boolean;
  ctaText: string;
  ctaButton: string;
  onChange: (p: Partial<VslCase>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const label = item.kind === "testimonial" ? "Testimonial" : "Case study";

  if (editing) {
    return (
      <article className="vsl-case is-editing">
        <div className="vsl-edit-row">
          <label className="vsl-field">
            <span>Type</span>
            <select value={item.kind} onChange={(e) => onChange({ kind: e.target.value as VslCase["kind"] })}>
              <option value="case_study">Case study</option>
              <option value="testimonial">Testimonial</option>
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <div className="vsl-tile-actions">
            <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Move up">
              ↑
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Move down">
              ↓
            </button>
            {confirm ? (
              <>
                <button type="button" onClick={onRemove}>
                  Yes, remove
                </button>
                <button type="button" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirm(true)}>
                Remove
              </button>
            )}
          </div>
        </div>
        <label className="vsl-field">
          <span>{item.kind === "testimonial" ? "Headline (optional)" : "Title"}</span>
          <input value={item.title} onChange={(e) => onChange({ title: e.target.value })} placeholder={item.kind === "testimonial" ? "“They tripled our bookings”" : "How Mehfil doubled its takeaway orders"} />
        </label>
        <label className="vsl-field">
          <span>{item.kind === "testimonial" ? "What they said" : "The story and the results"}</span>
          <textarea rows={5} value={item.body} onChange={(e) => onChange({ body: e.target.value })} />
        </label>
        <label className="vsl-field">
          <span>{item.kind === "testimonial" ? "Who said it" : "Client"}</span>
          <input value={item.person} onChange={(e) => onChange({ person: e.target.value })} placeholder="Sarah, owner of Mehfil" />
        </label>
        <label className="vsl-field">
          <span>Video or picture (Cloudinary link, optional)</span>
          <input value={item.media_url} onChange={(e) => onChange({ media_url: e.target.value })} placeholder="https://res.cloudinary.com/…" />
        </label>
        <Media url={item.media_url} />
      </article>
    );
  }

  return (
    <article className={`vsl-case ${item.media_url ? "has-media" : ""}`}>
      {item.media_url && <Media url={item.media_url} />}
      <div className="vsl-case-text">
        <span className="vsl-kicker">{label}</span>
        {item.title && <h3 className="vsl-h3">{item.title}</h3>}
        {item.body && <p className={item.kind === "testimonial" ? "vsl-quote" : "vsl-body"}>{item.body}</p>}
        {item.person && <p className="vsl-person">{item.person}</p>}
      </div>
      <div className="vsl-case-cta">
        <span>{ctaText}</span>
        <button type="button" className="vsl-btn" onClick={toForm}>
          {ctaButton || "Get started"}
        </button>
      </div>
    </article>
  );
}

function LinkBlock({ section, editing, onChange }: { section: VslLinkSection; editing: boolean; onChange: (p: Partial<VslLinkSection>) => void }) {
  if (editing) {
    return (
      <section className="vsl-section vsl-link-block is-editing">
        <label className="vsl-field">
          <span>Heading</span>
          <input value={section.heading} onChange={(e) => onChange({ heading: e.target.value })} />
        </label>
        <label className="vsl-field">
          <span>Text</span>
          <textarea rows={3} value={section.body} onChange={(e) => onChange({ body: e.target.value })} />
        </label>
        <div className="vsl-edit-row">
          <label className="vsl-field">
            <span>Button</span>
            <input value={section.button} onChange={(e) => onChange({ button: e.target.value })} />
          </label>
          <label className="vsl-field" style={{ flex: 2 }}>
            <span>Button goes to</span>
            <input value={section.url} onChange={(e) => onChange({ url: e.target.value })} />
          </label>
        </div>
      </section>
    );
  }
  if (!section.heading && !section.body) return null;
  return (
    <section className="vsl-section vsl-link-block">
      {section.heading && <h2 className="vsl-h2">{section.heading}</h2>}
      {section.body && <p className="vsl-body">{section.body}</p>}
      {section.url && (
        <a href={section.url} target="_blank" rel="noopener" className="vsl-btn vsl-btn--quiet">
          {section.button || "Find out more"} →
        </a>
      )}
    </section>
  );
}

function blankCase(kind: VslCase["kind"]): VslCase {
  return { id: newId("case"), kind, title: "", body: "", person: "", media_url: "" };
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

