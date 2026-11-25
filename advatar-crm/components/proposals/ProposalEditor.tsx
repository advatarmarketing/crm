"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ICONS, PACKAGE_IDS, type Extra, type IconName, type Line, type Media, type PackageId, type ProposalContent, type Slide } from "@/lib/proposals/content";
import { linePrice, money, totals } from "@/lib/proposals/pricing";
import { saveProposalAction, saveTemplateAction } from "@/app/app/prospects/proposal-actions";

/**
 * Editing a proposal before it's sent (0057). Every word, picture
 * link, hour, price and extra. Saved as one document; the server
 * checks it before it's stored.
 */

const PKG_SHORT: Record<PackageId, string> = { essentials: "Ess.", growth: "Growth", accelerator: "Acc." };

type Section = "basics" | "packages" | "contract" | "message" | `slide:${string}`;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function slugId(label: string, taken: string[]) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "item";
  let id = base;
  let n = 2;
  while (taken.includes(id)) id = `${base}_${n++}`;
  return id;
}

export function ProposalEditor({
  proposalId,
  dealId,
  title,
  initial,
  initialMessage,
  locked,
  templates,
}: {
  proposalId: string;
  dealId: string;
  title: string;
  initial: ProposalContent;
  initialMessage: string;
  locked: boolean;
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [content, setContent] = useState<ProposalContent>(initial);
  const [message, setMessage] = useState(initialMessage);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<Section>("basics");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplReplace, setTplReplace] = useState("");

  const edit = (fn: (c: ProposalContent) => void) => {
    setContent((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setSaved(null);
  };

  // Don't lose changes by closing the tab.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const monthly = useMemo(
    () => content.packages.map((p) => ({ ...p, monthly: totals(content, { package: p.id, plan: "monthly", extras: {} }).monthly })),
    [content]
  );

  const save = (then?: () => void) =>
    start(async () => {
      setError(null);
      const r = await saveProposalAction(proposalId, content, message);
      if (r.error) return setError(r.error);
      setDirty(false);
      setSaved("Saved");
      then?.();
    });

  const slide = section.startsWith("slide:") ? content.slides.find((s) => s.id === section.slice(6)) ?? null : null;
  const slideIndex = slide ? content.slides.indexOf(slide) : -1;
  const editSlide = (fn: (s: Slide) => void) =>
    edit((c) => {
      const s = c.slides[slideIndex];
      if (s) fn(s);
    });

  const sections: { id: Section; label: string; sub?: string; off?: boolean }[] = [
    { id: "basics", label: "Basics", sub: "Rate, discount, opening words" },
    { id: "packages", label: "Packages", sub: "Names and which to show" },
    ...content.slides.map((s) => ({ id: `slide:${s.id}` as Section, label: s.title || s.id, sub: s.kind === "topic" ? "Topic page, no price" : "Priced", off: !s.enabled })),
    { id: "contract", label: "Contract" },
    { id: "message", label: "Message to send" },
  ];

  return (
    <div className="pe">
      <div className="pe-bar">
        <div className="pe-bar-title">
          <Link href={`/app/prospects/deals/${dealId}`} className="back-link">
            ← {title}
          </Link>
          <span className="pe-totals">
            {monthly
              .filter((p) => p.enabled)
              .map((p) => (
                <span key={p.id}>
                  {p.name} <b>{money(p.monthly)}</b>/mo
                </span>
              ))}
          </span>
        </div>
        <div className="pe-bar-actions">
          <span className="pe-state" role="status">
            {pending ? "Saving…" : dirty ? "Unsaved changes" : saved ?? ""}
          </span>
          {!locked && (
            <button type="button" className="btn btn-primary" onClick={() => save()} disabled={pending || !dirty}>
              Save
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => (locked || !dirty ? router.push(`/app/prospects/proposals/${proposalId}/preview`) : save(() => router.push(`/app/prospects/proposals/${proposalId}/preview`)))}
          >
            Preview
          </button>
          <button type="button" className="btn" onClick={() => setTplOpen((o) => !o)}>
            Save as template
          </button>
        </div>
      </div>

      {tplOpen && (
        <form
          className="card card-pad pe-tpl"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const name = tplReplace ? templates.find((t) => t.id === tplReplace)?.name ?? tplName : tplName;
              const r = await saveTemplateAction(name, content, message, tplReplace || null);
              if (r.error) return setError(r.error);
              setTplOpen(false);
              setSaved(`Saved as the template "${name}"`);
              router.refresh();
            });
          }}
        >
          <label>
            <span className="vm-label">Save this set-up as</span>
            <select value={tplReplace} onChange={(e) => setTplReplace(e.target.value)}>
              <option value="">A new template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  Replace “{t.name}”
                </option>
              ))}
            </select>
          </label>
          {!tplReplace && (
            <label>
              <span className="vm-label">Name</span>
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Restaurants" maxLength={80} required />
            </label>
          )}
          <button className="btn btn-primary" disabled={pending}>
            Save template
          </button>
        </form>
      )}

      {locked && <p className="access-note">The client has accepted this version, so it can&rsquo;t be changed. Make a new version from the deal page to change anything.</p>}
      {error && <p className="vm-error" role="alert">{error}</p>}

      <div className="pe-body">
        <nav className="pe-nav" aria-label="Parts of the proposal">
          <select className="pe-nav-select" value={section} onChange={(e) => setSection(e.target.value as Section)} aria-label="Part to edit">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {s.off ? " (hidden)" : ""}
              </option>
            ))}
          </select>
          <ul>
            {sections.map((s) => (
              <li key={s.id}>
                <button type="button" aria-current={section === s.id ? "true" : undefined} data-off={s.off ? "true" : undefined} onClick={() => setSection(s.id)}>
                  <b>{s.label}</b>
                  {s.sub && <span>{s.off ? "Hidden" : s.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <fieldset className="pe-panel" disabled={locked}>
          {section === "basics" && (
            <>
              <h2>Basics</h2>
              <div className="pe-grid">
                <Field label="Hourly rate (£)">
                  <NumIn value={content.rate} onChange={(v) => edit((c) => void (c.rate = v))} />
                </Field>
                <Field label="3 months upfront discount (%)">
                  <NumIn value={content.discountPct} max={90} onChange={(v) => edit((c) => void (c.discountPct = v))} />
                </Field>
                <Field label="Package shown first">
                  <select value={content.defaultPackage} onChange={(e) => edit((c) => void (c.defaultPackage = e.target.value as PackageId))}>
                    {content.packages
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <h3>First page (the packages)</h3>
              <Field label="Small heading">
                <input value={content.intro.kicker} maxLength={80} onChange={(e) => edit((c) => void (c.intro.kicker = e.target.value))} />
              </Field>
              <Field label="Big heading">
                <input value={content.intro.title} maxLength={160} onChange={(e) => edit((c) => void (c.intro.title = e.target.value))} />
              </Field>
              <Field label="Line under it">
                <input value={content.intro.subtitle} maxLength={300} onChange={(e) => edit((c) => void (c.intro.subtitle = e.target.value))} />
              </Field>
              <h3>Last page (the total)</h3>
              <Field label="Big heading">
                <input value={content.summary.title} maxLength={120} onChange={(e) => edit((c) => void (c.summary.title = e.target.value))} />
              </Field>
              <Field label="Line under it">
                <input value={content.summary.subtitle} maxLength={300} onChange={(e) => edit((c) => void (c.summary.subtitle = e.target.value))} />
              </Field>
            </>
          )}

          {section === "packages" && (
            <>
              <h2>Packages</h2>
              <p className="pe-help">Switch one off to show only two. What&rsquo;s in each package is set on each priced page, in its price breakdown.</p>
              {content.packages.map((p, i) => (
                <div key={p.id} className="pe-row-card">
                  <label className="pe-switch">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) =>
                        edit((c) => {
                          c.packages[i].enabled = e.target.checked;
                          if (!e.target.checked && c.defaultPackage === p.id) c.defaultPackage = c.packages.find((x) => x.enabled)?.id ?? c.defaultPackage;
                        })
                      }
                    />
                    Show
                  </label>
                  <Field label="Name">
                    <input value={p.name} maxLength={40} onChange={(e) => edit((c) => void (c.packages[i].name = e.target.value))} />
                  </Field>
                  <Field label="Tagline">
                    <input value={p.tagline} maxLength={160} onChange={(e) => edit((c) => void (c.packages[i].tagline = e.target.value))} />
                  </Field>
                  <span className="pe-price">{money(monthly[i].monthly)}/mo</span>
                </div>
              ))}
            </>
          )}

          {slide && (
            <>
              <div className="pe-slide-head">
                <h2>{slide.title || slide.id}</h2>
                <label className="pe-switch">
                  <input type="checkbox" checked={slide.enabled} onChange={(e) => editSlide((s) => void (s.enabled = e.target.checked))} />
                  Show this page
                </label>
              </div>
              <p className="pe-help">
                {slide.kind === "topic"
                  ? "A topic page: visuals and headlines, no price. It shows when anything after it is in the package."
                  : "A priced page. It shows in every package that has at least one line with a number above 0."}
              </p>
              <div className="pe-grid">
                <Field label="Small heading">
                  <input value={slide.kicker} maxLength={80} onChange={(e) => editSlide((s) => void (s.kicker = e.target.value))} />
                </Field>
                <Field label="Short name (packages page, summary)">
                  <input value={slide.short} maxLength={80} onChange={(e) => editSlide((s) => void (s.short = e.target.value))} />
                </Field>
              </div>
              <Field label="Big heading">
                <input value={slide.title} maxLength={160} onChange={(e) => editSlide((s) => void (s.title = e.target.value))} />
              </Field>

              <ListEditor
                label="Headlines"
                items={slide.headlines}
                max={8}
                onAdd={() => editSlide((s) => void s.headlines.push(""))}
                onRemove={(i) => editSlide((s) => void s.headlines.splice(i, 1))}
                render={(h, i) => <input value={h} maxLength={200} placeholder="A short, result-focused line" onChange={(e) => editSlide((s) => void (s.headlines[i] = e.target.value))} />}
              />

              <ListEditor
                label="Pictures and videos (Cloudinary links)"
                help="Paste a Cloudinary link for each. Videos play muted on a loop. Empty ones show a placeholder."
                items={slide.media}
                max={16}
                onAdd={() => editSlide((s) => void s.media.push({ url: "", caption: "" }))}
                onRemove={(i) => editSlide((s) => void s.media.splice(i, 1))}
                render={(m: Media, i) => (
                  <div className="pe-media">
                    <span className="pe-thumb">{m.url ? /\.(mp4|webm|mov|m4v)(\?|$)|\/video\/upload\//i.test(m.url) ? <video src={m.url} muted /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.url} alt="" /> : "—"}</span>
                    <input value={m.url} placeholder="https://res.cloudinary.com/…" maxLength={2000} onChange={(e) => editSlide((s) => void (s.media[i].url = e.target.value.trim()))} aria-label="Link" />
                    <input value={m.caption} placeholder="Caption shown on tap" maxLength={200} onChange={(e) => editSlide((s) => void (s.media[i].caption = e.target.value))} aria-label="Caption" />
                  </div>
                )}
              />

              <ListEditor
                label="Visual tiles (icon and a few words)"
                items={slide.points}
                max={12}
                onAdd={() => editSlide((s) => void s.points.push({ icon: "spark", label: "" }))}
                onRemove={(i) => editSlide((s) => void s.points.splice(i, 1))}
                render={(pt, i) => (
                  <div className="pe-point">
                    <select value={pt.icon} onChange={(e) => editSlide((s) => void (s.points[i].icon = e.target.value as IconName))} aria-label="Icon">
                      {ICONS.map((ic) => (
                        <option key={ic} value={ic}>
                          {ic}
                        </option>
                      ))}
                    </select>
                    <input value={pt.label} maxLength={80} onChange={(e) => editSlide((s) => void (s.points[i].label = e.target.value))} aria-label="Words" />
                  </div>
                )}
              />

              {slide.kind === "priced" && (
                <>
                  <h3>Price breakdown, per package, per month</h3>
                  <p className="pe-help">
                    &ldquo;Hours&rdquo; lines are number × hours each × {money(content.rate)}. &ldquo;Fixed&rdquo; lines are number × the price. Put 0 for a package that doesn&rsquo;t include it.
                  </p>
                  <div className="pe-table-wrap">
                    <table className="pe-table">
                      <thead>
                        <tr>
                          <th>Line</th>
                          <th>Billed</th>
                          <th>Hours / £ each</th>
                          <th>Counted in</th>
                          {PACKAGE_IDS.map((p) => (
                            <th key={p}>{PKG_SHORT[p]}</th>
                          ))}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {slide.lines.map((l: Line, i) => (
                          <tr key={i}>
                            <td>
                              <input value={l.label} maxLength={160} onChange={(e) => editSlide((s) => void (s.lines[i].label = e.target.value))} aria-label="Line" />
                            </td>
                            <td>
                              <select value={l.mode} onChange={(e) => editSlide((s) => void (s.lines[i].mode = e.target.value as Line["mode"]))} aria-label="Billed">
                                <option value="hours">Hours</option>
                                <option value="fixed">Fixed £</option>
                              </select>
                            </td>
                            <td>
                              <NumIn value={l.unit} onChange={(v) => editSlide((s) => void (s.lines[i].unit = v))} label={l.mode === "hours" ? "Hours each" : "Price each"} />
                            </td>
                            <td>
                              <input value={l.unitLabel} maxLength={30} onChange={(e) => editSlide((s) => void (s.lines[i].unitLabel = e.target.value))} aria-label="Counted in (e.g. video, shoot, hour)" />
                            </td>
                            {PACKAGE_IDS.map((p) => (
                              <td key={p}>
                                <NumIn value={l.qty[p]} onChange={(v) => editSlide((s) => void (s.lines[i].qty[p] = v))} label={`${PKG_SHORT[p]} amount`} />
                                <small className="pe-calc">{money(linePrice(l, l.qty[p], content.rate))}</small>
                              </td>
                            ))}
                            <td>
                              <button type="button" className="vm-link" onClick={() => editSlide((s) => void s.lines.splice(i, 1))}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      editSlide((s) =>
                        void s.lines.push({ id: slugId("line", s.lines.map((x) => x.id)), label: "New line", mode: "hours", unit: 1, unitLabel: "hour", qty: { essentials: 0, growth: 0, accelerator: 0 } })
                      )
                    }
                  >
                    + Add a line
                  </button>

                  <h3>Extras the client can add</h3>
                  <div className="pe-table-wrap">
                    <table className="pe-table">
                      <thead>
                        <tr>
                          <th>Extra</th>
                          <th>Billed</th>
                          <th>Hours / £ each</th>
                          <th>Counted in</th>
                          <th>Most they can add</th>
                          <th>Each</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {slide.extras.map((x: Extra, i) => (
                          <tr key={i}>
                            <td>
                              <input value={x.label} maxLength={160} onChange={(e) => editSlide((s) => void (s.extras[i].label = e.target.value))} aria-label="Extra" />
                            </td>
                            <td>
                              <select value={x.mode} onChange={(e) => editSlide((s) => void (s.extras[i].mode = e.target.value as Extra["mode"]))} aria-label="Billed">
                                <option value="hours">Hours</option>
                                <option value="fixed">Fixed £</option>
                              </select>
                            </td>
                            <td>
                              <NumIn value={x.unit} onChange={(v) => editSlide((s) => void (s.extras[i].unit = v))} label="Hours or price each" />
                            </td>
                            <td>
                              <input value={x.unitLabel} maxLength={30} onChange={(e) => editSlide((s) => void (s.extras[i].unitLabel = e.target.value))} aria-label="Counted in" />
                            </td>
                            <td>
                              <NumIn value={x.max} max={100} onChange={(v) => editSlide((s) => void (s.extras[i].max = v))} label="Most they can add" />
                            </td>
                            <td className="pe-calc">{money(linePrice(x, 1, content.rate))}</td>
                            <td>
                              <button type="button" className="vm-link" onClick={() => editSlide((s) => void s.extras.splice(i, 1))}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => editSlide((s) => void s.extras.push({ id: slugId("extra", s.extras.map((x) => x.id)), label: "New extra", mode: "hours", unit: 1, unitLabel: "hour", max: 4 }))}
                  >
                    + Add an extra
                  </button>

                  {slide.group === "ads" && (
                    <>
                      <h3>Suggested ad budget a month (paid by the client, not in the total)</h3>
                      <label className="pe-switch">
                        <input
                          type="checkbox"
                          checked={Boolean(slide.budget)}
                          onChange={(e) => editSlide((s) => void (s.budget = e.target.checked ? { essentials: 0, growth: 0, accelerator: 0 } : null))}
                        />
                        Show a suggested budget
                      </label>
                      {slide.budget && (
                        <div className="pe-grid">
                          {PACKAGE_IDS.map((p) => (
                            <Field key={p} label={`${content.packages.find((x) => x.id === p)?.name} (£)`}>
                              <NumIn value={slide.budget![p]} max={1000000} onChange={(v) => editSlide((s) => void (s.budget![p] = v))} />
                            </Field>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <Field label="Small note under the breakdown">
                    <input value={slide.note ?? ""} maxLength={400} onChange={(e) => editSlide((s) => void (s.note = e.target.value || undefined))} />
                  </Field>
                </>
              )}
            </>
          )}

          {section === "contract" && (
            <>
              <h2>Contract</h2>
              <p className="pe-help">
                These fill in for each client: {"{{business}} {{contact}} {{email}} {{date}} {{package}} {{breakdown}} {{plan}} {{monthly}} {{total}}"}. Have the wording checked before relying on it.
              </p>
              <textarea className="pe-long" rows={26} value={content.contract} maxLength={30000} onChange={(e) => edit((c) => void (c.contract = e.target.value))} />
            </>
          )}

          {section === "message" && (
            <>
              <h2>Message to send</h2>
              <p className="pe-help">
                &ldquo;Copy message&rdquo; on the deal page copies this, ready to paste into an email from your Advatar address. These fill in: {"{{contact}} {{business}} {{link}}"}.
              </p>
              <textarea
                className="pe-long"
                rows={12}
                value={message}
                maxLength={6000}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setDirty(true);
                  setSaved(null);
                }}
              />
            </>
          )}
        </fieldset>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="pe-field">
      <span className="vm-label">{label}</span>
      {children}
    </label>
  );
}

function NumIn({ value, onChange, max = 100000, label }: { value: number; onChange: (v: number) => void; max?: number; label?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={max}
      step="any"
      value={text}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && n >= 0 && n <= max) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

function ListEditor<T>({
  label,
  help,
  items,
  max,
  onAdd,
  onRemove,
  render,
}: {
  label: string;
  help?: string;
  items: T[];
  max: number;
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (item: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="pe-list">
      <span className="vm-label">{label}</span>
      {help && <p className="pe-help">{help}</p>}
      {items.map((it, i) => (
        <div key={i} className="pe-list-row">
          <div className="pe-list-main">{render(it, i)}</div>
          <button type="button" className="vm-link" onClick={() => onRemove(i)}>
            Remove
          </button>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="btn" onClick={onAdd}>
          + Add
        </button>
      )}
    </div>
  );
}
