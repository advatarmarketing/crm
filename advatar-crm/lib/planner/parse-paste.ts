/**
 * Turns a written-out content plan into a PlannerContent.
 *
 * The input is the "=== SECTION ===" block format produced outside the
 * CRM and pasted in whole. Everything here is deliberately forgiving,
 * because the text arrives written by a person or a generator rather
 * than exported by a machine:
 *
 *   - sections may appear in any order, and any of them may be missing;
 *   - a section nobody recognises is ignored rather than fatal;
 *   - labels are matched loosely, so "Backgrounds / set" finds the row
 *     called "Backgrounds / set style" and a stray capital or a
 *     missing word does not drop the line on the floor;
 *   - an em dash, an en dash and a hyphen are all the same character
 *     as far as this is concerned, since which one you get depends on
 *     what typed it.
 *
 * Anything it could not place is reported back rather than discarded
 * quietly — a plan that silently lost its pillars is worse than one
 * that says it could not find them.
 */

import {
  DEFAULT_PLANNER_CONTENT,
  makeId,
  type PlannerContent,
  type PlannerSlot,
} from "./content";

export interface ParseReport {
  /** Section names that were recognised and used. */
  filled: string[];
  /** Headings found in the text that mean nothing here. */
  ignored: string[];
  /** A short human line per section, e.g. "4 pillars". */
  notes: string[];
}

export interface ParseResult {
  content: PlannerContent;
  report: ParseReport;
}

/** Lowercase, letters and digits only — the key everything matches on. */
function key(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Every dash people actually type, flattened to one. */
function dashes(text: string): string {
  return text.replace(/[‐-―−]/g, "-");
}

function splitKV(line: string): [string, string] | null {
  const at = line.indexOf(":");
  if (at === -1) return null;
  // First colon only: "Fonts: Primary: X · Secondary: Y" is one field
  // whose value happens to contain colons.
  return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
}

/** The lines of a section, blank ones dropped. */
function lines(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Pulls "Key: value" pairs into a lookup keyed by the normalised key. */
function pairs(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of lines(block)) {
    const kv = splitKV(line);
    if (kv && kv[1]) out.set(key(kv[0]), kv[1]);
  }
  return out;
}

/**
 * Finds a value by any of several spellings. Exact match first, then
 * either side starting with the other, so "backgroundsset" finds
 * "backgroundssetstyle".
 */
function look(map: Map<string, string>, ...names: string[]): string | null {
  for (const n of names) {
    const k = key(n);
    const exact = map.get(k);
    if (exact) return exact;
  }
  for (const n of names) {
    const k = key(n);
    for (const [mk, mv] of map) {
      if (mk.startsWith(k) || k.startsWith(mk)) return mv;
    }
  }
  return null;
}

/** Splits the paste into its === SECTIONS ===. */
function sections(text: string): { name: string; block: string }[] {
  const out: { name: string; block: string }[] = [];
  const re = /^[ \t]*={2,}[ \t]*(.+?)[ \t]*={2,}[ \t]*$/gm;

  let match = re.exec(text);
  while (match) {
    const start = match.index + match[0].length;
    const next = re.exec(text);
    out.push({ name: match[1].trim(), block: text.slice(start, next ? next.index : undefined) });
    match = next;
  }
  return out;
}

/** A deep-enough copy that editing one plan never touches the template. */
function blankPlan(): PlannerContent {
  const plan = JSON.parse(JSON.stringify(DEFAULT_PLANNER_CONTENT)) as PlannerContent;

  // Fresh ids: a clone would otherwise give two clients rows with the
  // same id, and React keys off them.
  plan.branding.rows.forEach((r) => (r.id = makeId("brand")));
  plan.pillars.items.forEach((p) => (p.id = makeId("pillar")));
  plan.workflow.steps.forEach((s) => (s.id = makeId("wf")));
  plan.metrics.items.forEach((m) => (m.id = makeId("metric")));
  plan.competitors.links.forEach((l) => (l.id = makeId("link")));
  plan.producing.links.forEach((l) => (l.id = makeId("link")));
  plan.slots.items.forEach((s) => (s.id = makeId("slot")));
  plan.timeline.items.forEach((t) => (t.id = makeId("tl")));
  plan.guarantee.terms.forEach((t) => (t.id = makeId("term")));
  return plan;
}

/** "Intro: ..." or, failing that, the first line that isn't a field. */
function intro(block: string): string | null {
  const ls = lines(block);
  for (const line of ls) {
    const kv = splitKV(line);
    if (kv && key(kv[0]) === "intro") return kv[1];
  }
  return null;
}

/** Numbered rows: "01: Something" or "01 Something: description". */
function numbered(block: string): { num: string; rest: string }[] {
  const out: { num: string; rest: string }[] = [];
  for (const line of lines(block)) {
    const m = /^(\d{1,2})\s*[:.)]?\s+(.*)$/.exec(line) || /^(\d{1,2}):\s*(.*)$/.exec(line);
    if (m && m[2]) out.push({ num: m[1].padStart(2, "0"), rest: m[2].trim() });
  }
  return out;
}

export function parsePlannerPaste(text: string): ParseResult {
  const plan = blankPlan();
  const filled: string[] = [];
  const ignored: string[] = [];
  const notes: string[] = [];

  const found = sections(dashes(text));

  if (found.length === 0) {
    return {
      content: plan,
      report: {
        filled: [],
        ignored: [],
        notes: ["Couldn't find any === SECTION === headings in that text."],
      },
    };
  }

  for (const { name, block } of found) {
    const k = key(name);
    const p = pairs(block);
    const ls = lines(block);

    // ---------------- hero ----------------
    if (k.startsWith("hero") || k.includes("slate")) {
      const set = (field: keyof PlannerContent["hero"], ...names: string[]) => {
        const v = look(p, ...names);
        if (v) plan.hero[field] = v;
      };
      set("scene", "Scene");
      set("take", "Take");
      set("director", "Director");
      set("roll", "Roll");
      set("brand", "Headline", "Brand");
      set("sub", "Subtitle", "Sub");
      filled.push("Hero");
      continue;
    }

    // ---------------- pull quote ----------------
    if (k.includes("pullquote") || k === "quote" || k.includes("thesis")) {
      plan.thesis.quote = look(p, "Quote") ?? plan.thesis.quote;
      plan.thesis.caption = look(p, "Caption") ?? plan.thesis.caption;
      filled.push("Pull quote");
      continue;
    }

    // ---------------- overview ----------------
    if (k.startsWith("overview")) {
      plan.overview.tag = look(p, "Eyebrow", "Tag") ?? plan.overview.tag;
      plan.overview.heading = look(p, "Heading", "Title") ?? plan.overview.heading;
      plan.overview.desc = look(p, "Body", "Description", "Desc") ?? plan.overview.desc;
      filled.push("Overview");
      continue;
    }

    // ---------------- branding ----------------
    if (k.startsWith("branding") || k.includes("positioning")) {
      let hits = 0;
      for (const line of ls) {
        const kv = splitKV(line);
        if (!kv || !kv[1]) continue;
        const want = key(kv[0]);
        if (want === "intro") continue;

        const row = plan.branding.rows.find((r) => {
          const have = key(r.label);
          return have === want || have.startsWith(want) || want.startsWith(have);
        });

        if (row) {
          row.value = kv[1];
        } else {
          // Something the sheet has no row for. Added rather than
          // dropped — it is a detail about the brand either way.
          plan.branding.rows.push({ id: makeId("brand"), label: kv[0], value: kv[1] });
        }
        hits++;
      }
      filled.push("Branding");
      notes.push(`${hits} branding detail${hits === 1 ? "" : "s"}`);
      continue;
    }

    // ---------------- pillars ----------------
    if (k.includes("pillar")) {
      const items: PlannerContent["pillars"]["items"] = [];
      const colours = DEFAULT_PLANNER_CONTENT.pillars.items.map((i) => i.color);
      let current: (typeof items)[number] | null = null;
      let descLines: string[] = [];

      const close = () => {
        if (current) {
          current.description = descLines.join(" ").trim();
          items.push(current);
        }
        current = null;
        descLines = [];
      };

      for (const line of ls) {
        const head = /^(.+?)\s*-\s*(\d{1,3})\s*%$/.exec(line);
        if (head) {
          close();
          current = {
            id: makeId("pillar"),
            name: head[1].trim(),
            pct: Math.max(0, Math.min(100, parseInt(head[2], 10))),
            subtitle: "",
            description: "",
            tags: [],
            color: colours[items.length % colours.length],
          };
          continue;
        }
        if (!current) continue;

        const kv = splitKV(line);
        if (kv && key(kv[0]) === "tags") {
          current.tags = kv[1]
            .split(/[,;·]/)
            .map((t) => t.trim())
            .filter(Boolean);
          continue;
        }

        // The line straight after the heading is the card's subtitle;
        // everything after that, up to Tags, is the description.
        if (!current.subtitle) current.subtitle = line;
        else descLines.push(line);
      }
      close();

      if (items.length) {
        plan.pillars.items = items;
        filled.push("Pillars");
        notes.push(`${items.length} pillar${items.length === 1 ? "" : "s"}`);
      }
      const d = intro(block);
      if (d) plan.pillars.desc = d;
      continue;
    }

    // ---------------- format mix ----------------
    if (k.includes("format")) {
      const d = intro(block);
      if (d) plan.format.desc = d;

      let hits = 0;
      for (const line of ls) {
        const kv = splitKV(line);
        if (!kv || !kv[1] || key(kv[0]) === "intro") continue;
        const want = key(kv[0]);
        const stat = plan.format.stats.find((s) => {
          const have = key(s.label);
          return have === want || have.startsWith(want) || want.startsWith(have);
        });
        if (stat) {
          stat.value = kv[1];
          hits++;
        } else {
          plan.format.stats.push({ value: kv[1], label: kv[0] });
          hits++;
        }
      }
      filled.push("Format mix");
      notes.push(`${hits} format figure${hits === 1 ? "" : "s"}`);
      continue;
    }

    // ---------------- workflow ----------------
    if (k.includes("workflow")) {
      const d = intro(block);
      if (d) plan.workflow.desc = d;

      const steps: PlannerContent["workflow"]["steps"] = [];
      for (const { num, rest } of numbered(block)) {
        const kv = splitKV(rest);
        steps.push({
          id: makeId("wf"),
          num,
          title: kv ? kv[0].trim() : rest,
          description: kv ? kv[1] : "",
        });
      }
      if (steps.length) {
        plan.workflow.steps = steps;
        filled.push("Workflow");
        notes.push(`${steps.length} workflow step${steps.length === 1 ? "" : "s"}`);
      }
      continue;
    }

    // ---------------- metrics ----------------
    if (k.includes("metric")) {
      const d = intro(block);
      if (d) plan.metrics.desc = d;

      const items: PlannerContent["metrics"]["items"] = [];
      for (const line of ls) {
        const kv = splitKV(line);
        if (!kv || !kv[1] || key(kv[0]) === "intro") continue;
        items.push({ id: makeId("metric"), label: kv[0], value: kv[1] });
      }
      if (items.length) {
        plan.metrics.items = items;
        filled.push("Metrics");
        notes.push(`${items.length} metric${items.length === 1 ? "" : "s"}`);
      }
      continue;
    }

    // ---------------- the two link lists ----------------
    const isCompetitors = k.includes("competitor");
    const isProducing = k.includes("producing") || k.includes("whatwere");
    if (isCompetitors || isProducing) {
      const target = isCompetitors ? plan.competitors : plan.producing;
      const d = intro(block);
      if (d) target.desc = d;

      const rows = numbered(block).filter((r) => key(r.rest) !== "intro");
      if (rows.length) {
        target.links = rows.map((r) => ({ id: makeId("link"), title: r.rest, url: "" }));
        filled.push(isCompetitors ? "Competitors" : "What we're producing");
        notes.push(`${rows.length} ${isCompetitors ? "competitor" : "piece"}${rows.length === 1 ? "" : "s"}`);
      }
      continue;
    }

    // ---------------- video slots ----------------
    if (k.includes("videoslot") || k.includes("slotplanner") || k.includes("videoslotplanner")) {
      const d = intro(block);
      if (d) plan.slots.desc = d;

      const countRaw = look(p, "Videos this month", "Videos", "Count");
      const parsed: PlannerSlot[] = [];
      let current: PlannerSlot | null = null;
      let oneLiner: string[] = [];

      const close = () => {
        if (current) {
          if (!current.description) current.description = oneLiner.join(" ").trim();
          parsed.push(current);
        }
        current = null;
        oneLiner = [];
      };

      for (const line of ls) {
        const head = /^video\s*(\d{1,3})\s*-\s*(.*)$/i.exec(line);
        if (head) {
          close();
          current = {
            id: makeId("slot"),
            title: head[2].trim(),
            description: "",
            pillar: "",
            link: "",
            hook: "",
            body: "",
            cta: "",
            wms: "",
            scenery: "",
            set: "",
          };
          continue;
        }
        if (!current) continue;

        const kv = splitKV(line);
        const field = kv ? key(kv[0]) : "";
        if (kv && kv[1] && ["hook", "body", "cta", "wms", "scenery", "set", "videoset", "link"].includes(field)) {
          if (field === "hook") current.hook = kv[1];
          else if (field === "body") current.body = kv[1];
          else if (field === "cta") current.cta = kv[1];
          else if (field === "wms") current.wms = kv[1];
          else if (field === "scenery") current.scenery = kv[1];
          else if (field === "link") current.link = kv[1];
          else current.set = kv[1];
          continue;
        }
        if (!current.description && !current.hook) oneLiner.push(line);
      }
      close();

      // How many slots the month commits to, which can be more than
      // the number written out in full. The rest stay blank, with
      // their prompts, rather than being quietly dropped.
      const wanted = countRaw ? parseInt(countRaw.replace(/[^0-9]/g, ""), 10) : parsed.length;
      const total = Math.max(parsed.length, Number.isFinite(wanted) && wanted > 0 ? wanted : parsed.length);

      plan.slots.items = Array.from({ length: total }, (_, i) =>
        parsed[i] ?? {
          id: makeId("slot"),
          title: "",
          description: "",
          pillar: "",
          link: "",
          hook: "",
          body: "",
          cta: "",
          wms: "",
          scenery: "",
          set: "",
        }
      );

      filled.push("Video slots");
      notes.push(
        parsed.length === total
          ? `${total} video slot${total === 1 ? "" : "s"}`
          : `${total} video slots, ${parsed.length} written out`
      );
      continue;
    }

    // ---------------- timeline ----------------
    if (k.includes("timeline")) {
      const d = intro(block);
      if (d) plan.timeline.desc = d;

      const items: PlannerContent["timeline"]["items"] = [];
      let current: (typeof items)[number] | null = null;
      let body: string[] = [];

      const close = () => {
        if (current) {
          if (!current.description) current.description = body.join(" ").trim();
          items.push(current);
        }
        current = null;
        body = [];
      };

      for (const line of ls) {
        // "Week 01 (DD MMM - DD MMM)", "Phase 2", "Month 3 (Jan)".
        const head = /^((?:week|phase|month|stage)\s*[\w-]+)\s*(?:\((.*?)\))?\s*$/i.exec(line);
        if (head) {
          close();
          const label = head[1].trim();
          current = {
            id: makeId("tl"),
            date: head[2] ? `${label} · ${head[2].trim()}` : label,
            title: "",
            description: "",
            done: false,
            owner: "",
            milestone: "",
          };
          continue;
        }
        if (!current) continue;

        const kv = splitKV(line);
        const field = kv ? key(kv[0]) : "";
        if (kv && kv[1] && field === "owner") {
          current.owner = kv[1];
          continue;
        }
        if (kv && kv[1] && field === "milestone") {
          current.milestone = kv[1];
          // The milestone is the headline of the window, so it doubles
          // as the card's title where nothing else gave one.
          if (!current.title) current.title = kv[1];
          continue;
        }
        if (kv && kv[1] && (field === "title" || field === "whathappens")) {
          if (field === "title") current.title = kv[1];
          else body.push(kv[1]);
          continue;
        }
        body.push(line);
      }
      close();

      if (items.length) {
        plan.timeline.items = items;
        filled.push("Timeline");
        notes.push(`${items.length} timeline phase${items.length === 1 ? "" : "s"}`);
      }
      continue;
    }

    // ---------------- guarantee ----------------
    if (k.includes("guarantee")) {
      plan.guarantee.tag = look(p, "Eyebrow", "Tag") ?? plan.guarantee.tag;
      plan.guarantee.heading = look(p, "Heading", "Title") ?? plan.guarantee.heading;
      plan.guarantee.body = look(p, "Intro", "Body", "Promise") ?? plan.guarantee.body;

      const terms = numbered(block);
      if (terms.length) {
        plan.guarantee.terms = terms.map((t) => ({ id: makeId("term"), text: t.rest }));
        notes.push(`${terms.length} guarantee term${terms.length === 1 ? "" : "s"}`);
      }
      filled.push("Guarantee");
      continue;
    }

    ignored.push(name);
  }

  return { content: plan, report: { filled, ignored, notes } };
}
