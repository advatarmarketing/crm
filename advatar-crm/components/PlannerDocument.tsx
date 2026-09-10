"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PLANNER_CONTENT, makeId, type PlannerContent, type PlannerSlot } from "@/lib/planner/content";
import { PLANNER_CSS } from "@/lib/planner/css";

const NAV_SECTIONS: { id: string; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "branding", label: "Branding" },
  { id: "pillars", label: "Pillars" },
  { id: "format", label: "Format" },
  { id: "schedule", label: "Schedule" },
  { id: "workflow", label: "Workflow" },
  { id: "metrics", label: "Metrics" },
  { id: "competitors", label: "Competitors" },
  { id: "producing", label: "Our Work" },
  { id: "slots", label: "Slot Planner" },
  { id: "timeline", label: "Timeline" },
  { id: "guarantee", label: "Guarantee" },
];

const SAVE_DEBOUNCE_MS = 600;

// Immutable nested update: setDeep(content, ['pillars','items',0,'name'], 'New name')
function setDeep(obj: any, path: (string | number)[], value: any): any {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  if (Array.isArray(obj)) {
    const arr = obj.slice();
    arr[key as number] = setDeep(arr[key as number], rest, value);
    return arr;
  }
  return { ...obj, [key]: setDeep(obj?.[key], rest, value) };
}

function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------
// Small editable-text primitive shared by every section below.
// Read-only mode renders plain text; editable mode renders a
// contentEditable node that commits on blur only (not on every
// keystroke), so the parent never re-renders mid-typing and the
// caret never jumps.
// ---------------------------------------------------------------
function Editable({
  as: Tag = "span",
  value,
  onCommit,
  editable,
  className,
  style,
}: {
  as?: keyof JSX.IntrinsicElements;
  value: string;
  onCommit: (next: string) => void;
  editable: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!editable) {
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }
  return (
    <Tag
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const text = e.currentTarget.textContent ?? "";
        if (text !== value) onCommit(text);
      }}
    >
      {value}
    </Tag>
  );
}

function RemoveBtn({ onClick, className = "pillar-remove", title = "Remove" }: { onClick: () => void; className?: string; title?: string }) {
  return (
    <button type="button" className={className} title={title} onClick={onClick}>
      &times;
    </button>
  );
}

export function PlannerDocument({
  clientId,
  editable,
  requirePublished = false,
  emptyMessage = "Your content plan isn't published yet — check back soon.",
}: {
  clientId: string;
  editable: boolean;
  /**
   * Phase 7 split this out from `editable`. The client portal needs
   * BOTH read-only UI AND a hard status='published' filter (clients
   * must never see a draft, per Phase 3's RLS and this component's
   * own double-check). A videographer viewing /app/my-clients/[id]
   * also gets read-only UI, but per Phase 3's "planners: videographer
   * read assigned" policy they're allowed to see a client's plan
   * while it's still in draft — only `clients` are status-gated.
   * Pass this true only for the actual client-portal usage.
   */
  requirePublished?: boolean;
  /** Shown when there's nothing to render — wording differs by audience. */
  emptyMessage?: string;
}) {
  const supabase = createClient();
  const [content, setContent] = useState<PlannerContent | null>(null);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeAct, setActiveAct] = useState(0);
  const [activeSection, setActiveSection] = useState("overview");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentJson = useRef<string | null>(null);
  const contentRef = useRef<PlannerContent | null>(null);
  const statusRef = useRef(status);
  contentRef.current = content;
  statusRef.current = status;

  // ---------------- initial fetch / provision ----------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      let query = supabase.from("planners").select("*").eq("client_id", clientId);
      // Double-checked here even though Phase 3's RLS already blocks
      // a client session from ever getting a draft row back — belt
      // and braces per this phase's spec. Gated on requirePublished,
      // NOT on editable=false in general — a read-only videographer
      // view should still see a draft plan (Phase 3's RLS already
      // allows that for an assigned videographer), just without edit
      // controls.
      if (requirePublished) {
        query = query.eq("status", "published");
      }

      const { data: row } = await query.maybeSingle();

      if (cancelled) return;

      if (row) {
        setContent(row.content as unknown as PlannerContent);
        setStatus(row.status as "draft" | "published");
        lastSentJson.current = JSON.stringify(row.content);
        setLoading(false);
        return;
      }

      if (!editable) {
        // No published planner yet for this client — never create
        // one from the read-only/client side. Clients have no insert
        // policy on `planners` anyway (Phase 3), so this would fail
        // even if attempted; we just don't attempt it.
        setNotAvailable(true);
        setLoading(false);
        return;
      }

      // Staff/ceo viewing a client with no planner row yet — create
      // one from the default template.
      const { data: created } = await supabase
        .from("planners")
        .insert({ client_id: clientId, content: DEFAULT_PLANNER_CONTENT as any, status: "draft" })
        .select()
        .single();

      if (cancelled) return;

      if (created) {
        setContent(created.content as unknown as PlannerContent);
        setStatus(created.status as "draft" | "published");
        lastSentJson.current = JSON.stringify(created.content);
      } else {
        // Someone else created it between our select and insert
        // (two staff opening the same brand-new client at once) —
        // re-fetch rather than erroring out.
        const { data: retry } = await supabase
          .from("planners")
          .select("*")
          .eq("client_id", clientId)
          .maybeSingle();
        if (retry) {
          setContent(retry.content as unknown as PlannerContent);
          setStatus(retry.status as "draft" | "published");
          lastSentJson.current = JSON.stringify(retry.content);
        }
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, editable]);

  // ---------------- realtime ----------------
  useEffect(() => {
    const channel = supabase
      .channel(`planners:${clientId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planners", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const row = payload.new as { content: PlannerContent; status: "draft" | "published" } | undefined;
          if (!row) return;
          const incomingJson = JSON.stringify(row.content);
          // Skip our own echo — we already have this content locally.
          if (incomingJson === lastSentJson.current) return;
          setContent(row.content);
          setStatus(row.status);
          lastSentJson.current = incomingJson;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ---------------- debounced save ----------------
  const scheduleSave = useCallback(
    (next: PlannerContent, nextStatus: "draft" | "published" = statusRef.current) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaveState("saving");
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const json = JSON.stringify(next);
        const { error } = await supabase.from("planners").upsert(
          {
            client_id: clientId,
            content: next as any,
            status: nextStatus,
            updated_by: user?.id ?? null,
          },
          { onConflict: "client_id" }
        );
        lastSentJson.current = json;
        setSaveState(error ? "error" : "saved");
      }, SAVE_DEBOUNCE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId]
  );

  const update = useCallback(
    (path: (string | number)[], value: any) => {
      setContent((prev) => {
        if (!prev) return prev;
        const next = setDeep(prev, path, value);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  function toggleStatus() {
    const next = status === "draft" ? "published" : "draft";
    setStatus(next);
    if (contentRef.current) scheduleSave(contentRef.current, next);
  }

  // ---------------- scrollspy ----------------
  useEffect(() => {
    function onScroll() {
      const scrollPos = window.scrollY + 80;
      let current = NAV_SECTIONS[0]?.id;
      for (const s of NAV_SECTIONS) {
        const el = document.getElementById(`planner-${clientId}-${s.id}`);
        if (el && el.offsetTop <= scrollPos) current = s.id;
      }
      setActiveSection(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [clientId]);

  if (loading) {
    return (
      <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)", padding: 24 }}>
        Loading plan…
      </p>
    );
  }

  if (notAvailable || !content) {
    return (
      <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)", padding: 24 }}>
        {emptyMessage}
      </p>
    );
  }

  const sid = (name: string) => `planner-${clientId}-${name}`;

  return (
    <div className="planner-doc">
      <style dangerouslySetInnerHTML={{ __html: PLANNER_CSS }} />

      <div className="slate-stripes" id={sid("top")}></div>
      <div className="hero">
        <div className="hero-inner">
          {/* The film-slate metadata (SCENE / TAKE / DIRECTOR / ROLL)
              is set dressing, and it was the first thing a client saw
              on the page. It now shows only while editing, so the
              values stay reachable and editable for staff without
              being the opening line of the client's plan. */}
          {editable && (
            <div className="eyebrow-row">
              <span>
                SCENE:{" "}
                <Editable as="b" editable={editable} value={content.hero.scene} onCommit={(v) => update(["hero", "scene"], v)} />
              </span>
              <span>
                TAKE:{" "}
                <Editable as="b" editable={editable} value={content.hero.take} onCommit={(v) => update(["hero", "take"], v)} />
              </span>
              <span>
                DIRECTOR:{" "}
                <Editable as="b" editable={editable} value={content.hero.director} onCommit={(v) => update(["hero", "director"], v)} />
              </span>
              <span>
                ROLL:{" "}
                <Editable as="b" editable={editable} value={content.hero.roll} onCommit={(v) => update(["hero", "roll"], v)} />
              </span>
            </div>
          )}
          <Editable
            as="h1"
            className="brand"
            editable={editable}
            value={content.hero.brand}
            onCommit={(v) => update(["hero", "brand"], v)}
          />
          <Editable
            as="p"
            className="hero-sub"
            editable={editable}
            value={content.hero.sub}
            onCommit={(v) => update(["hero", "sub"], v)}
          />
        </div>
      </div>

      {editable && <LogoSlot logoUrl={content.logoUrl} onChange={(url) => update(["logoUrl"], url)} />}
      {!editable && content.logoUrl && (
        <div className="logo-slot-wrap">
          <div className="logo-slot has-image">
            <img src={content.logoUrl} alt="Business logo" />
          </div>
        </div>
      )}

      <div className="thesis">
        <p>
          <span className="lead-mark">&ldquo;</span>
          <Editable editable={editable} value={content.thesis.quote} onCommit={(v) => update(["thesis", "quote"], v)} />
          <span className="lead-mark">&rdquo;</span>
        </p>
        <Editable as="small" editable={editable} value={content.thesis.caption} onCommit={(v) => update(["thesis", "caption"], v)} />
      </div>

      <nav className="page-nav">
        <div className="page-nav-inner">
          <a href={`#${sid("top")}`} className="page-nav-top">
            {content.hero.brand.replace(/\.$/, "")} ↑
          </a>
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${sid(s.id)}`}
              className={"page-nav-link" + (activeSection === s.id ? " active" : "")}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <SectionHead id={sid("overview")} editable={editable} data={content.overview} onCommit={(field, v) => update(["overview", field], v)} />

      <section id={sid("branding")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.branding} onCommit={(field, v) => update(["branding", field], v)} />
        <div className="brand-table">
          {content.branding.rows.map((row, i) => (
            <div className="brand-row" key={row.id}>
              <Editable as="span" className="brand-label" editable={editable} value={row.label} onCommit={(v) => update(["branding", "rows", i, "label"], v)} />
              <Editable as="span" className="brand-value" editable={editable} value={row.value} onCommit={(v) => update(["branding", "rows", i, "value"], v)} />
              {editable && (
                <RemoveBtn
                  className="brand-remove"
                  onClick={() =>
                    setContent((prev) => {
                      if (!prev) return prev;
                      const next = { ...prev, branding: { ...prev.branding, rows: prev.branding.rows.filter((_, idx) => idx !== i) } };
                      scheduleSave(next);
                      return next;
                    })
                  }
                />
              )}
            </div>
          ))}
        </div>
        {editable && (
          <button
            className="add-brand-btn"
            type="button"
            onClick={() =>
              setContent((prev) => {
                if (!prev) return prev;
                const next = {
                  ...prev,
                  branding: {
                    ...prev.branding,
                    rows: [...prev.branding.rows, { id: makeId("brand"), label: "New detail", value: "Add a note here." }],
                  },
                };
                scheduleSave(next);
                return next;
              })
            }
          >
            + Add detail
          </button>
        )}
      </section>

      <section id={sid("pillars")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.pillars} onCommit={(field, v) => update(["pillars", field], v)} />
        <div className="pillars">
          {content.pillars.items.map((pillar, i) => (
            <div className="pillar-card" key={pillar.id}>
              {editable && (
                <RemoveBtn
                  title="Remove pillar"
                  onClick={() =>
                    setContent((prev) => {
                      if (!prev) return prev;
                      const next = { ...prev, pillars: { ...prev.pillars, items: prev.pillars.items.filter((_, idx) => idx !== i) } };
                      scheduleSave(next);
                      return next;
                    })
                  }
                />
              )}
              <div className="top-row">
                <Editable as="h3" editable={editable} value={pillar.name} onCommit={(v) => update(["pillars", "items", i, "name"], v)} />
                <Editable
                  as="span"
                  className="pct"
                  style={{ color: pillar.color }}
                  editable={editable}
                  value={`${pillar.pct}%`}
                  onCommit={(v) => {
                    const num = parseInt(v.replace(/[^0-9]/g, ""), 10);
                    update(["pillars", "items", i, "pct"], Number.isNaN(num) ? 0 : Math.max(0, Math.min(100, num)));
                  }}
                />
              </div>
              <Editable as="span" className="role" editable={editable} value={pillar.subtitle} onCommit={(v) => update(["pillars", "items", i, "subtitle"], v)} />
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${pillar.pct}%`, background: pillar.color }} />
              </div>
              <Editable as="p" editable={editable} value={pillar.description} onCommit={(v) => update(["pillars", "items", i, "description"], v)} />
              <div className="chips">
                {pillar.tags.map((tag, ti) => (
                  <span className="chip" key={ti}>
                    <Editable
                      as="span"
                      className="chip-text"
                      editable={editable}
                      value={tag}
                      onCommit={(v) => update(["pillars", "items", i, "tags", ti], v)}
                    />
                    {editable && (
                      <RemoveBtn
                        className="chip-remove"
                        title="Remove tag"
                        onClick={() =>
                          setContent((prev) => {
                            if (!prev) return prev;
                            const tags = prev.pillars.items[i].tags.filter((_, idx) => idx !== ti);
                            const items = prev.pillars.items.slice();
                            items[i] = { ...items[i], tags };
                            const next = { ...prev, pillars: { ...prev.pillars, items } };
                            scheduleSave(next);
                            return next;
                          })
                        }
                      />
                    )}
                  </span>
                ))}
                {editable && (
                  <button
                    className="chip-add"
                    type="button"
                    title="Add tag"
                    onClick={() =>
                      setContent((prev) => {
                        if (!prev) return prev;
                        const items = prev.pillars.items.slice();
                        items[i] = { ...items[i], tags: [...items[i].tags, "New tag"] };
                        const next = { ...prev, pillars: { ...prev.pillars, items } };
                        scheduleSave(next);
                        return next;
                      })
                    }
                  >
                    + Tag
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {editable && (
          <button
            className="add-pillar-btn"
            type="button"
            onClick={() =>
              setContent((prev) => {
                if (!prev) return prev;
                const next = {
                  ...prev,
                  pillars: {
                    ...prev.pillars,
                    items: [
                      ...prev.pillars.items,
                      {
                        id: makeId("pillar"),
                        name: "New Pillar",
                        pct: 10,
                        subtitle: "What this is for",
                        description: "Describe what this pillar covers and why it's here.",
                        tags: ["Example format"],
                        color: "var(--red)",
                      },
                    ],
                  },
                };
                scheduleSave(next);
                return next;
              })
            }
          >
            + Add pillar
          </button>
        )}
      </section>

      <section id={sid("format")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.format} onCommit={(field, v) => update(["format", field], v)} />
        <div className="format-row">
          {content.format.stats.map((stat, i) => (
            <div className="format-stat" key={i}>
              <Editable as="span" className="num" editable={editable} value={stat.value} onCommit={(v) => update(["format", "stats", i, "value"], v)} />
              <Editable as="span" className="lbl" editable={editable} value={stat.label} onCommit={(v) => update(["format", "stats", i, "label"], v)} />
            </div>
          ))}
        </div>
      </section>

      <section id={sid("schedule")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.schedule} onCommit={(field, v) => update(["schedule", field], v)} />
        <div className="tabs">
          {content.schedule.acts.map((act, i) => (
            <button
              key={act.id}
              type="button"
              className={"tab-btn" + (activeAct === i ? " active" : "")}
              onClick={() => setActiveAct(i)}
            >
              {act.tabLabel}
            </button>
          ))}
        </div>
        {content.schedule.acts.map((act, actIdx) => (
          <div key={act.id} className={"act-panel" + (activeAct === actIdx ? " active" : "")}>
            {act.weeks.map((week, weekIdx) => (
              <div className="week-row" key={week.id}>
                <div className="week-tc">
                  <Editable
                    as="span"
                    className="wk-num"
                    editable={editable}
                    value={week.weekLabel}
                    onCommit={(v) => update(["schedule", "acts", actIdx, "weeks", weekIdx, "weekLabel"], v)}
                  />
                  <Editable
                    as="small"
                    editable={editable}
                    value={week.weekSub}
                    onCommit={(v) => update(["schedule", "acts", actIdx, "weeks", weekIdx, "weekSub"], v)}
                  />
                </div>
                <div className="week-body">
                  <Editable as="h4" editable={editable} value={week.title} onCommit={(v) => update(["schedule", "acts", actIdx, "weeks", weekIdx, "title"], v)} />
                  <Editable as="p" editable={editable} value={week.description} onCommit={(v) => update(["schedule", "acts", actIdx, "weeks", weekIdx, "description"], v)} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section id={sid("workflow")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.workflow} onCommit={(field, v) => update(["workflow", field], v)} />
        <div className="workflow">
          {content.workflow.steps.map((step, i) => (
            <div className="wf-step" key={step.id}>
              <Editable as="span" className="wf-num" editable={editable} value={step.num} onCommit={(v) => update(["workflow", "steps", i, "num"], v)} />
              <Editable as="h4" editable={editable} value={step.title} onCommit={(v) => update(["workflow", "steps", i, "title"], v)} />
              <Editable as="p" editable={editable} value={step.description} onCommit={(v) => update(["workflow", "steps", i, "description"], v)} />
            </div>
          ))}
        </div>
      </section>

      <section id={sid("metrics")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.metrics} onCommit={(field, v) => update(["metrics", field], v)} />
        <div className="metrics">
          {content.metrics.items.map((m, i) => (
            <div className="metric-card" key={m.id}>
              <Editable as="span" className="m-lbl" editable={editable} value={m.label} onCommit={(v) => update(["metrics", "items", i, "label"], v)} />
              <Editable as="span" className="m-val" editable={editable} value={m.value} onCommit={(v) => update(["metrics", "items", i, "value"], v)} />
            </div>
          ))}
        </div>
      </section>

      <LinkListSection
        id={sid("competitors")}
        editable={editable}
        section={content.competitors}
        onHeadCommit={(field, v) => update(["competitors", field], v)}
        onLinkCommit={(i, field, v) => update(["competitors", "links", i, field], v)}
        onAdd={() =>
          setContent((prev) => {
            if (!prev) return prev;
            const next = { ...prev, competitors: { ...prev.competitors, links: [...prev.competitors.links, { id: makeId("link"), title: "New entry", url: "" }] } };
            scheduleSave(next);
            return next;
          })
        }
        onRemove={(i) =>
          setContent((prev) => {
            if (!prev) return prev;
            const next = { ...prev, competitors: { ...prev.competitors, links: prev.competitors.links.filter((_, idx) => idx !== i) } };
            scheduleSave(next);
            return next;
          })
        }
      />

      <LinkListSection
        id={sid("producing")}
        editable={editable}
        section={content.producing}
        onHeadCommit={(field, v) => update(["producing", field], v)}
        onLinkCommit={(i, field, v) => update(["producing", "links", i, field], v)}
        onAdd={() =>
          setContent((prev) => {
            if (!prev) return prev;
            const next = { ...prev, producing: { ...prev.producing, links: [...prev.producing.links, { id: makeId("link"), title: "New entry", url: "" }] } };
            scheduleSave(next);
            return next;
          })
        }
        onRemove={(i) =>
          setContent((prev) => {
            if (!prev) return prev;
            const next = { ...prev, producing: { ...prev.producing, links: prev.producing.links.filter((_, idx) => idx !== i) } };
            scheduleSave(next);
            return next;
          })
        }
      />

      <SlotPlannerSection
        id={sid("slots")}
        editable={editable}
        section={content.slots}
        pillarNames={content.pillars.items.map((p) => p.name)}
        onHeadCommit={(field, v) => update(["slots", field], v)}
        onSlotChange={(i, field, v) => update(["slots", "items", i, field], v)}
        onGenerate={(count) =>
          setContent((prev) => {
            if (!prev) return prev;
            const existing = prev.slots.items;
            const items = Array.from({ length: count }, (_, i) => existing[i] ?? { id: makeId("slot"), title: `Video ${String(i + 1).padStart(2, "0")}`, description: "What this video covers, in a line or two.", pillar: "", link: "", hook: "", body: "", cta: "", wms: "", scenery: "", set: "" });
            const next = { ...prev, slots: { ...prev.slots, items } };
            scheduleSave(next);
            return next;
          })
        }
      />

      <section id={sid("timeline")} style={{ paddingTop: 0 }}>
        <SectionHeadInner editable={editable} data={content.timeline} onCommit={(field, v) => update(["timeline", field], v)} />
        <TimelineProgress items={content.timeline.items} />
        <div className="timeline">
          {content.timeline.items.map((item, i) => (
            <div className={"timeline-item" + (item.done ? " done" : "")} key={item.id}>
              <div
                className="timeline-dot"
                title="Click to mark complete"
                onClick={() => update(["timeline", "items", i, "done"], !item.done)}
              />
              <div className="timeline-card">
                {editable && (
                  <RemoveBtn
                    className="timeline-remove"
                    onClick={() =>
                      setContent((prev) => {
                        if (!prev) return prev;
                        const next = { ...prev, timeline: { ...prev.timeline, items: prev.timeline.items.filter((_, idx) => idx !== i) } };
                        scheduleSave(next);
                        return next;
                      })
                    }
                  />
                )}
                <div className="timeline-date-row">
                  <Editable as="span" className="timeline-date" editable={editable} value={item.date} onCommit={(v) => update(["timeline", "items", i, "date"], v)} />
                  <span className="timeline-done-tag">✓ Done</span>
                </div>
                <Editable as="h4" className="timeline-title" editable={editable} value={item.title} onCommit={(v) => update(["timeline", "items", i, "title"], v)} />
                <Editable as="p" className="timeline-desc" editable={editable} value={item.description} onCommit={(v) => update(["timeline", "items", i, "description"], v)} />
              </div>
            </div>
          ))}
        </div>
        {editable && (
          <button
            className="add-timeline-btn"
            type="button"
            onClick={() =>
              setContent((prev) => {
                if (!prev) return prev;
                const next = {
                  ...prev,
                  timeline: {
                    ...prev.timeline,
                    items: [...prev.timeline.items, { id: makeId("tl"), date: "New date", title: "New milestone", description: "Describe what happens at this point in the timeline.", done: false }],
                  },
                };
                scheduleSave(next);
                return next;
              })
            }
          >
            + Add milestone
          </button>
        )}
      </section>

      <section className="guarantee-section" id={sid("guarantee")}>
        <div className="slate-stripes" />
        <div className="guarantee-mark">
          <svg viewBox="0 0 100 100" width="62" height="62" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--red)" strokeWidth="1.4" />
            <circle cx="50" cy="50" r="37" fill="none" stroke="var(--red)" strokeWidth="1" />
            <path d="M34,51 L45,62 L67,38" fill="none" stroke="var(--red)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="guarantee-inner">
          <Editable as="span" className="guarantee-tag" editable={editable} value={content.guarantee.tag} onCommit={(v) => update(["guarantee", "tag"], v)} />
          <Editable as="h2" className="guarantee-h2" editable={editable} value={content.guarantee.heading} onCommit={(v) => update(["guarantee", "heading"], v)} />
          <Editable as="p" className="guarantee-body" editable={editable} value={content.guarantee.body} onCommit={(v) => update(["guarantee", "body"], v)} />
          <div className="guarantee-terms">
            {content.guarantee.terms.map((term, i) => (
              <div className="guarantee-term" key={term.id}>
                <span className="term-num">{String(i + 1).padStart(2, "0")}</span>
                <Editable as="span" className="term-text" editable={editable} value={term.text} onCommit={(v) => update(["guarantee", "terms", i, "text"], v)} />
                {editable && (
                  <RemoveBtn
                    className="gp-remove"
                    onClick={() =>
                      setContent((prev) => {
                        if (!prev) return prev;
                        const next = { ...prev, guarantee: { ...prev.guarantee, terms: prev.guarantee.terms.filter((_, idx) => idx !== i) } };
                        scheduleSave(next);
                        return next;
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
          {editable && (
            <button
              className="gp-add"
              type="button"
              onClick={() =>
                setContent((prev) => {
                  if (!prev) return prev;
                  const next = { ...prev, guarantee: { ...prev.guarantee, terms: [...prev.guarantee.terms, { id: makeId("term"), text: "New guarantee term" }] } };
                  scheduleSave(next);
                  return next;
                })
              }
            >
              + Add term
            </button>
          )}
        </div>
      </section>

      <footer>ADVATAR — PRODUCTION SCHEDULE — ROLL 01 OF MANY</footer>

      {editable && (
        <div className="toolbar">
          <span className="status">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Couldn't save — check connection"}
            {saveState === "idle" && "Click any text to edit"}
          </span>
          <button type="button" className="secondary" onClick={toggleStatus}>
            {status === "draft" ? "Publish" : "Unpublish"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- shared subcomponents ----------------

function SectionHead({
  id,
  editable,
  data,
  onCommit,
}: {
  id: string;
  editable: boolean;
  data: { tag: string; heading: string; desc: string };
  onCommit: (field: "tag" | "heading" | "desc", value: string) => void;
}) {
  return (
    <section id={id}>
      <SectionHeadInner editable={editable} data={data} onCommit={onCommit} />
    </section>
  );
}

function SectionHeadInner({
  editable,
  data,
  onCommit,
}: {
  editable: boolean;
  data: { tag: string; heading: string; desc: string };
  onCommit: (field: "tag" | "heading" | "desc", value: string) => void;
}) {
  return (
    <div className="section-head">
      <Editable as="span" className="tag" editable={editable} value={data.tag} onCommit={(v) => onCommit("tag", v)} />
      <Editable as="h2" editable={editable} value={data.heading} onCommit={(v) => onCommit("heading", v)} />
      <Editable as="p" className="desc" editable={editable} value={data.desc} onCommit={(v) => onCommit("desc", v)} />
    </div>
  );
}

function LogoSlot({ logoUrl, onChange }: { logoUrl: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => onChange(String(e.target?.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="logo-slot-wrap">
      <div>
        <label className={"logo-slot" + (logoUrl ? " has-image" : "")}>
          {!logoUrl && (
            <span className="logo-placeholder">
              +<br />
              Add logo
            </span>
          )}
          {logoUrl && <img src={logoUrl} alt="Business logo" />}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        {logoUrl && (
          <div className="logo-remove" onClick={() => onChange(null)}>
            Remove logo
          </div>
        )}
      </div>
    </div>
  );
}

function LinkListSection({
  id,
  editable,
  section,
  onHeadCommit,
  onLinkCommit,
  onAdd,
  onRemove,
}: {
  id: string;
  editable: boolean;
  section: { tag: string; heading: string; desc: string; links: { id: string; title: string; url: string }[] };
  onHeadCommit: (field: "tag" | "heading" | "desc", value: string) => void;
  onLinkCommit: (index: number, field: "title" | "url", value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section id={id} style={{ paddingTop: 0 }}>
      <SectionHeadInner editable={editable} data={section} onCommit={onHeadCommit} />
      <div className="link-list">
        {section.links.map((link, i) => {
          const hasLink = isValidHttpUrl(link.url);
          return (
            <div className={"link-row" + (hasLink ? " has-link" : "")} key={link.id}>
              <span className="link-idx">{String(i + 1).padStart(2, "0")}</span>
              <Editable as="span" className="link-title" editable={editable} value={link.title} onCommit={(v) => onLinkCommit(i, "title", v)} />
              {editable ? (
                <input
                  type="text"
                  className="link-input"
                  placeholder="Paste link…"
                  value={link.url}
                  onChange={(e) => onLinkCommit(i, "url", e.target.value)}
                />
              ) : (
                <span />
              )}
              <a className="link-open" href={hasLink ? link.url : "#"} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link">
                ↗
              </a>
              {editable && <RemoveBtn className="link-remove" onClick={() => onRemove(i)} />}
            </div>
          );
        })}
      </div>
      {editable && (
        <button className="add-link-btn" type="button" onClick={onAdd}>
          + Add link
        </button>
      )}
    </section>
  );
}

function SlotPlannerSection({
  id,
  editable,
  section,
  pillarNames,
  onHeadCommit,
  onSlotChange,
  onGenerate,
}: {
  id: string;
  editable: boolean;
  section: { tag: string; heading: string; desc: string; items: PlannerSlot[] };
  pillarNames: string[];
  onHeadCommit: (field: "tag" | "heading" | "desc", value: string) => void;
  onSlotChange: (index: number, field: SlotFieldName, value: string) => void;
  onGenerate: (count: number) => void;
}) {
  const [countInput, setCountInput] = useState(String(section.items.length));

  return (
    <section id={id} style={{ paddingTop: 0 }}>
      <SectionHeadInner editable={editable} data={section} onCommit={onHeadCommit} />
      {editable && (
        <div className="slot-controls">
          <label className="slot-count-label" htmlFor="slotCount">
            Videos this month
          </label>
          <input
            id="slotCount"
            type="number"
            className="slot-count-input"
            min={1}
            max={60}
            value={countInput}
            onChange={(e) => setCountInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                let n = parseInt(countInput, 10);
                if (Number.isNaN(n) || n < 1) n = 1;
                if (n > 60) n = 60;
                onGenerate(n);
              }
            }}
          />
          <button
            className="slot-generate-btn"
            type="button"
            onClick={() => {
              let n = parseInt(countInput, 10);
              if (Number.isNaN(n) || n < 1) n = 1;
              if (n > 60) n = 60;
              onGenerate(n);
            }}
          >
            Generate slots
          </button>
        </div>
      )}
      {groupSlotsBySet(section.items).map((group) => (
        <div className="slot-set" key={group.name || "__unset"}>
          {/* Only shown once a set has been named. Before that the
              plan is just a list of videos, and a heading reading
              "Unassigned" over every card would be noise. */}
          {group.name && (
            <div className="slot-set-head">
              <span className="slot-set-name">{group.name}</span>
              <span className="slot-set-count">
                {group.entries.length} video{group.entries.length === 1 ? "" : "s"} · one shoot day
              </span>
            </div>
          )}
          <div className="slot-grid">
        {group.entries.map(({ slot, i }) => {
          const hasLink = isValidHttpUrl(slot.link);
          return (
            <div className="slot-card" key={slot.id}>
              <span className="slot-num">{String(i + 1).padStart(2, "0")}</span>
              <Editable as="div" className="slot-title" editable={editable} value={slot.title} onCommit={(v) => onSlotChange(i, "title", v)} />
              <Editable as="div" className="slot-desc" editable={editable} value={slot.description} onCommit={(v) => onSlotChange(i, "description", v)} />
              {editable ? (
                <select className="slot-pillar-select" value={slot.pillar} onChange={(e) => onSlotChange(i, "pillar", e.target.value)}>
                  <option value="">Select content pillar…</option>
                  {pillarNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : (
                slot.pillar && <div className="slot-pillar-select">{slot.pillar}</div>
              )}
              {/* The preset brief. Every slot asks the same questions in
                  the same order, so a videographer reading the plan on
                  a shoot day always finds the answer in the same
                  place — and nobody has to remember the structure to
                  fill one in. */}
              <div className="slot-brief">
                <SlotField label="Hook" value={slot.hook} editable={editable} onCommit={(v) => onSlotChange(i, "hook", v)} placeholder="The first line — what stops the scroll" />
                <SlotField label="The body" value={slot.body} editable={editable} onCommit={(v) => onSlotChange(i, "body", v)} placeholder="What it actually says" multiline />
                <SlotField label="CTA" value={slot.cta} editable={editable} onCommit={(v) => onSlotChange(i, "cta", v)} placeholder="What they should do next" />
                <div className="slot-brief-pair">
                  <SlotField label="WMS" value={slot.wms} editable={editable} onCommit={(v) => onSlotChange(i, "wms", v)} />
                  <SlotField label="Scenery (i/a)" value={slot.scenery} editable={editable} onCommit={(v) => onSlotChange(i, "scenery", v)} />
                </div>
                <SlotField label="Video Set" value={slot.set} editable={editable} onCommit={(v) => onSlotChange(i, "set", v)} placeholder="Which shoot day this is filmed on" />
              </div>

              <div className={"slot-link-wrap" + (hasLink ? " has-link" : "")}>
                {editable ? (
                  <input
                    type="text"
                    className="slot-link-input"
                    placeholder="Paste finished video link…"
                    value={slot.link}
                    onChange={(e) => onSlotChange(i, "link", e.target.value)}
                  />
                ) : (
                  <span className="slot-link-input">{slot.link}</span>
                )}
                <a className="slot-link-open" href={hasLink ? slot.link : "#"} target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open link">
                  ↗
                </a>
              </div>
            </div>
          );
        })}
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Slots in the order they were written, gathered under their shoot.
 *
 * Order is preserved rather than sorted: the sets appear in the order
 * their first video does, which is the order somebody planning the
 * month laid them out. Anything without a set yet falls to the end, so
 * naming a set pulls those videos up into it rather than shuffling the
 * whole page.
 *
 * The original index rides along because that is what edits are keyed
 * on — the slot's position in the saved document, not its position on
 * screen after grouping.
 */
function groupSlotsBySet(items: PlannerSlot[]) {
  const groups: { name: string; entries: { slot: PlannerSlot; i: number }[] }[] = [];
  const byName = new Map<string, { name: string; entries: { slot: PlannerSlot; i: number }[] }>();

  items.forEach((slot, i) => {
    const name = (slot.set ?? "").trim();
    let group = byName.get(name);
    if (!group) {
      group = { name, entries: [] };
      byName.set(name, group);
      groups.push(group);
    }
    group.entries.push({ slot, i });
  });

  // Un-set videos last, whatever order they were found in.
  return groups.sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1));
}

/** Which parts of a slot are editable text. */
type SlotFieldName =
  | "title"
  | "description"
  | "pillar"
  | "link"
  | "hook"
  | "body"
  | "cta"
  | "wms"
  | "scenery"
  | "set";

/**
 * One labelled line of a slot's brief.
 *
 * The label is always rendered, filled in or not — that is what makes
 * this a template rather than a blank box. An empty field reads as
 * "Hook: —", which tells you the question was asked and not yet
 * answered; hiding it would just look like the brief was shorter.
 */
function SlotField({
  label,
  value,
  editable,
  onCommit,
  placeholder,
  multiline = false,
}: {
  label: string;
  value?: string;
  editable: boolean;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const filled = Boolean(value && value.trim());

  return (
    <div className={"slot-field" + (multiline ? " slot-field-tall" : "")}>
      <span className="slot-field-label">{label}</span>
      {editable ? (
        <Editable
          as="div"
          className={"slot-field-value" + (filled ? "" : " is-empty")}
          editable
          value={value ?? ""}
          onCommit={onCommit}
          style={placeholder && !filled ? ({ "--placeholder": `"${placeholder}"` } as React.CSSProperties) : undefined}
        />
      ) : (
        <span className={"slot-field-value" + (filled ? "" : " is-empty")}>{filled ? value : "—"}</span>
      )}
    </div>
  );
}

function TimelineProgress({ items }: { items: { done: boolean; date: string; title: string }[] }) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  let badgeClass = "state-not-started";
  let badgeText = "Not started";
  let statusText = total ? `First up: ${items[0].date} — ${items[0].title}` : "Add a milestone to start tracking progress.";

  if (total === 0) {
    badgeText = "No milestones";
  } else if (done === total) {
    badgeClass = "state-complete";
    badgeText = "Complete";
    statusText = `All ${total} milestones delivered.`;
  } else if (done > 0) {
    badgeClass = "";
    badgeText = "In progress";
    const next = items.find((i) => !i.done);
    if (next) statusText = `Next up: ${next.date} — ${next.title}`;
  }

  return (
    <>
      <div className="timeline-status">
        <span className={"timeline-status-badge " + badgeClass}>{badgeText}</span>
        <span className="timeline-status-text">{statusText}</span>
      </div>
      <div className="timeline-progress">
        <div className="timeline-progress-track">
          <div className="timeline-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="timeline-progress-label">
          {done} of {total} milestone{total === 1 ? "" : "s"} complete
        </span>
      </div>
    </>
  );
}
