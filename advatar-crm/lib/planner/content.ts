/**
 * Every editable piece of planner.html, as data. This shape is what
 * gets stored in planners.content (jsonb) and round-tripped through
 * Supabase — components/PlannerDocument.tsx renders it and writes
 * back into it, but never hardcodes any of this copy itself.
 *
 * DEFAULT_PLANNER_CONTENT below is planner.html's own hardcoded
 * example content, used as the starting template for a brand-new
 * client with no planner row yet.
 */

export interface PlannerPillar {
  id: string;
  name: string;
  pct: number;
  subtitle: string;
  description: string;
  tags: string[];
  color: string;
}

export interface PlannerFormatStat {
  value: string;
  label: string;
  /**
   * The greyed prompt for this stat's value. Per-stat rather than one
   * for the row, because "5–6 posts" and "Daily stories" are not the
   * same kind of answer and a single prompt would be wrong for four of
   * the five.
   */
  ph?: string;
}

export interface PlannerBrandRow {
  id: string;
  label: string;
  value: string;
  /**
   * The greyed prompt for this row's value. Stored alongside the row
   * because each one asks for something different — fonts, a palette,
   * who is on camera — so there is no single prompt the section could
   * use. A row somebody adds themselves simply has none.
   */
  ph?: string;
}

export interface PlannerWorkflowStep {
  id: string;
  num: string;
  title: string;
  description: string;
}

export interface PlannerMetric {
  id: string;
  label: string;
  value: string;
}

export interface PlannerLink {
  id: string;
  title: string;
  url: string;
}

export interface PlannerSlot {
  id: string;
  title: string;
  description: string;
  pillar: string;
  link: string;

  /**
   * The shooting brief, as one preset shape per video rather than a
   * paragraph somebody has to remember the structure of. Every slot
   * asks the same five questions, so a videographer reading the plan
   * always finds the answers in the same places.
   *
   * All optional: plans written before this existed have slots without
   * them, and those must keep opening rather than breaking. Everything
   * reading these treats a missing field as an empty one.
   */
  hook?: string;
  body?: string;
  cta?: string;
  /** Kept as the initials the team already uses. */
  wms?: string;
  /** "i/a" — indoor or outdoor, in the team's own shorthand. */
  scenery?: string;

  /**
   * Which shoot this video belongs to. Videos are filmed in batches,
   * so the plan groups by this and the calendar entry for the day
   * reads "Video Set 1 — shoot day". Free text, because the sets are
   * named by whoever plans the month.
   */
  set?: string;
}

export interface PlannerTimelineItem {
  id: string;
  date: string;
  title: string;
  description: string;
  done: boolean;
}

export interface PlannerGuaranteeTerm {
  id: string;
  text: string;
}

export interface PlannerContent {
  logoUrl: string | null;

  hero: {
    scene: string;
    take: string;
    director: string;
    roll: string;
    brand: string;
    sub: string;
  };

  thesis: {
    quote: string;
    caption: string;
  };

  overview: {
    tag: string;
    heading: string;
    desc: string;
  };

  branding: {
    tag: string;
    heading: string;
    desc: string;
    rows: PlannerBrandRow[];
  };

  pillars: {
    tag: string;
    heading: string;
    desc: string;
    items: PlannerPillar[];
  };

  format: {
    tag: string;
    heading: string;
    desc: string;
    stats: PlannerFormatStat[];
  };

  workflow: {
    tag: string;
    heading: string;
    desc: string;
    steps: PlannerWorkflowStep[];
  };

  metrics: {
    tag: string;
    heading: string;
    desc: string;
    items: PlannerMetric[];
  };

  competitors: {
    tag: string;
    heading: string;
    desc: string;
    links: PlannerLink[];
  };

  producing: {
    tag: string;
    heading: string;
    desc: string;
    links: PlannerLink[];
  };

  slots: {
    tag: string;
    heading: string;
    desc: string;
    items: PlannerSlot[];
  };

  timeline: {
    tag: string;
    heading: string;
    desc: string;
    items: PlannerTimelineItem[];
  };

  guarantee: {
    tag: string;
    heading: string;
    body: string;
    terms: PlannerGuaranteeTerm[];
  };
}

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;

/**
 * The greyed prompts shown in empty fields in the editor.
 *
 * Kept here, beside the template they belong to, so the blank value
 * and the prompt that explains it cannot drift apart. Nothing in here
 * is ever stored or shown to a client — an unanswered field in a
 * published plan is simply blank, rather than showing them an
 * instruction we wrote to ourselves.
 *
 * Prompts that repeat down a list (every pillar, every metric, every
 * video slot) live here as one string and are passed to each row. The
 * two that genuinely differ per row — the branding sheet and the
 * format mix — carry their prompt on the row itself instead.
 */
export const PLANNER_PH = {
  logo: "Drop client logo",

  hero: {
    scene: "RELAUNCH",
    take: "01",
    director: "Client lead name",
    roll: "What you're working with",
    brand: "The line that sums this account up.",
    sub: "CONTENT PLAN — THE MONTH AHEAD",
  },

  thesis: {
    quote:
      "The one sentence that sets the bar for this account — what you refuse to do, or what you're betting on instead.",
    caption: "THE STANDARD THIS ACCOUNT IS BUILT ON",
  },

  overview: {
    tag: "WHAT THIS ACCOUNT IS ACTUALLY FOR",
    heading: "The job this feed does",
    desc: "What this page is for, in plain terms — who it needs to convince, how it finds people who don't know you yet, and what it should look like six months from now.",
  },

  branding: {
    desc: "The reference sheet everything else gets built against — fill this in first, so pillars, shoots and edits all pull in the same direction.",
  },

  pillars: {
    desc: "How the month is divided, and why each pillar earns the share it has.",
    name: "Pillar name",
    pct: "00%",
    subtitle: "WHAT THIS PILLAR IS FOR",
    description:
      "What goes in this pillar, who it's aimed at, and why it earns this share of the month.",
    tag: "Format or angle",
  },

  format: {
    desc: "Why this mix — which format carries the reach, and what gets repurposed where.",
  },

  workflow: {
    desc: "Who this workflow is built around — team size and who owns what.",
    title: "Step name",
    description: "Who does it, when in the week it happens, and what comes out the other end.",
  },

  metrics: {
    desc: "Which numbers tie to the actual goal, and which ones to ignore.",
    label: "METRIC NAME",
    value: "Weekly",
  },

  competitors: {
    desc: "Log anything worth studying — just the link and a note on why it's here.",
    title: "Studio / handle",
  },

  producing: {
    desc: "Log finished pieces as they come off the line — title, link, done.",
    title: "Piece title — client or pillar",
  },

  slots: {
    title: "Working title",
    description: "What this video covers, in a line or two.",
    hook: "First 3 seconds — the line that stops the scroll",
    body: "What happens in the middle",
    cta: "What you want them to do next",
    wms: "What must be said, word for word",
    scenery: "Location, set, lighting",
    set: "Which shoot day this belongs to",
  },

  timeline: {
    desc: "The shape of the engagement — what gets shot, cut and published, and by when.",
    date: "Week 01",
    title: "Phase name",
    description: "What gets shot, cut, or published in this window.",
  },

  guarantee: {
    tag: "THE FINE PRINT, KEPT SHORT",
    heading: "Our guarantee",
    body: "The promise, with a number and a deadline attached — what happens if the plan doesn't hit it.",
    term: "One term, one line — no sub-clauses.",
  },
} as const;

/**
 * The starting template for a client with no plan yet.
 *
 * Deliberately empty. It used to carry Advatar's own worked example,
 * which read as somebody else's plan sitting in your client's
 * document — and worse, text that is already there has to be deleted
 * before it can be replaced, so the quickest thing to do with it was
 * to leave it. Blank fields with a prompt behind them ask to be
 * answered instead.
 *
 * What is NOT blank: the structural furniture that is the same for
 * every client — section headings, the labels down the branding
 * sheet, the names of the five format stats, the step numbers, and
 * the four pillar colours. Those are the form, not the answers.
 */
export const DEFAULT_PLANNER_CONTENT: PlannerContent = {
  logoUrl: null,

  hero: { scene: "", take: "", director: "", roll: "", brand: "", sub: "" },

  thesis: { quote: "", caption: "" },

  overview: { tag: "", heading: "", desc: "" },

  branding: {
    tag: "Brand DNA",
    heading: "Branding & positioning",
    desc: "",
    rows: [
      { id: id("brand"), label: "Brand essence (3 words)", value: "", ph: "Three words that describe the brand" },
      {
        id: id("brand"),
        label: "Mission statement (1 line)",
        value: "",
        ph: "Why this account exists, in one sentence — what changes for someone after they watch it.",
      },
      { id: id("brand"), label: "Tone of voice", value: "", ph: "Three words for how the brand talks" },
      { id: id("brand"), label: "Fonts", value: "", ph: "Primary: [font name] · Secondary: [font name]" },
      { id: id("brand"), label: "Colour palette", value: "", ph: "e.g. Navy, cream, gold accent" },
      { id: id("brand"), label: "Design style", value: "", ph: "How it should look and feel on the grid" },
      { id: id("brand"), label: "Sound design", value: "", ph: "Music, voice, SFX — and what's off-limits" },
      {
        id: id("brand"),
        label: "Backgrounds / set style",
        value: "",
        ph: "Where this gets filmed and how consistent it stays",
      },
      {
        id: id("brand"),
        label: "Faces of the brand",
        value: "",
        ph: "Who's on camera — founder, team, community, or a mix",
      },
    ],
  },

  pillars: {
    tag: "The shot list",
    heading: "Content pillars",
    desc: "",
    // Four cards, because four is what the layout is built for and a
    // month split more finely than that stops being a plan. The
    // colours stay — they are how the allocation bars tell themselves
    // apart, not content.
    items: [
      { id: id("pillar"), name: "", pct: 0, subtitle: "", description: "", tags: [""], color: "var(--red)" },
      { id: id("pillar"), name: "", pct: 0, subtitle: "", description: "", tags: [""], color: "var(--ink)" },
      { id: id("pillar"), name: "", pct: 0, subtitle: "", description: "", tags: [""], color: "var(--gold)" },
      { id: id("pillar"), name: "", pct: 0, subtitle: "", description: "", tags: [""], color: "var(--red-deep)" },
    ],
  },

  format: {
    tag: "Cadence",
    heading: "Format mix, weekly",
    desc: "",
    stats: [
      { value: "", label: "Posts / week", ph: "5–6" },
      { value: "", label: "Reels", ph: "65%" },
      { value: "", label: "Carousels", ph: "25%" },
      { value: "", label: "Static / announcement", ph: "10%" },
      { value: "", label: "Stories", ph: "Daily" },
    ],
  },

  workflow: {
    tag: "Production line",
    heading: "Weekly workflow",
    desc: "",
    steps: [
      { id: id("wf"), num: "01", title: "", description: "" },
      { id: id("wf"), num: "02", title: "", description: "" },
      { id: id("wf"), num: "03", title: "", description: "" },
      { id: id("wf"), num: "04", title: "", description: "" },
    ],
  },

  metrics: {
    tag: "What actually matters",
    heading: "Metrics to track",
    desc: "",
    items: [
      { id: id("metric"), label: "", value: "" },
      { id: id("metric"), label: "", value: "" },
      { id: id("metric"), label: "", value: "" },
      { id: id("metric"), label: "", value: "" },
    ],
  },

  competitors: {
    tag: "Competitive scan",
    heading: "What competitors are posting",
    desc: "",
    links: [
      { id: id("link"), title: "", url: "" },
      { id: id("link"), title: "", url: "" },
      { id: id("link"), title: "", url: "" },
    ],
  },

  producing: {
    tag: "Proof of work",
    heading: "What we're producing",
    desc: "",
    links: [
      { id: id("link"), title: "", url: "" },
      { id: id("link"), title: "", url: "" },
      { id: id("link"), title: "", url: "" },
    ],
  },

  slots: {
    tag: "Monthly output",
    heading: "Video slot planner",
    // Kept as real text rather than a prompt: this one explains how
    // the section works, which is true for every client and is not
    // something anybody should have to write.
    desc: "Set how many finished videos you're committing to this month. Each slot carries its own brief — hook, body, CTA, WMS and scenery — plus the shoot it belongs to and a spot for the link once it's done.",
    items: Array.from({ length: 12 }, () => ({
      id: id("slot"),
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
    })),
  },

  timeline: {
    tag: "How it rolls out",
    heading: "Client timeline",
    desc: "",
    items: [
      { id: id("tl"), date: "", title: "", description: "", done: false },
      { id: id("tl"), date: "", title: "", description: "", done: false },
      { id: id("tl"), date: "", title: "", description: "", done: false },
      { id: id("tl"), date: "", title: "", description: "", done: false },
      { id: id("tl"), date: "", title: "", description: "", done: false },
    ],
  },

  guarantee: {
    tag: "",
    heading: "",
    body: "",
    terms: [
      { id: id("term"), text: "" },
      { id: id("term"), text: "" },
      { id: id("term"), text: "" },
    ],
  },
};

export function makeId(prefix: string) {
  return id(prefix);
}
