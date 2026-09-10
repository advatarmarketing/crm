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
}

export interface PlannerBrandRow {
  id: string;
  label: string;
  value: string;
}

export interface PlannerWeek {
  id: string;
  weekLabel: string;
  weekSub: string;
  title: string;
  description: string;
}

export interface PlannerAct {
  id: string;
  tabLabel: string;
  weeks: PlannerWeek[];
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

  schedule: {
    tag: string;
    heading: string;
    desc: string;
    acts: PlannerAct[];
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

export const DEFAULT_PLANNER_CONTENT: PlannerContent = {
  logoUrl: null,

  hero: {
    scene: "Relaunch",
    take: "01",
    director: "Rayyan",
    roll: "2 Years of Footage",
    brand: "ADVATAR.",
    sub: "Content plan — the month ahead",
  },

  thesis: {
    quote:
      "No trending audio doing the work for us. No faces hired to hold the hook. Two years of client work, finally in one place — and it has to earn attention on its own.",
    caption: "THE STANDARD THIS ACCOUNT IS BUILT ON",
  },

  overview: {
    tag: "What this account is actually for",
    heading: "Three jobs, one feed",
    desc: "This isn't a general brand page — it's doing three jobs at once: it's the proof you send people you're already talking to, it's the thing that finds new clients on its own through Reels reach, and it's how people watch Advatar grow from a UK studio into something bigger. Every pillar below is built to serve at least one of those.",
  },

  branding: {
    tag: "Brand DNA",
    heading: "Branding & positioning",
    desc: "The reference sheet everything else in this plan gets built against — fill this in per client, first, so pillars, shoots, and edits all pull in the same direction.",
    rows: [
      { id: id("brand"), label: "Brand essence (3 words)", value: "Premium, purposeful, personal" },
      {
        id: id("brand"),
        label: "Mission statement (1 line)",
        value: "Why this account exists, in one sentence — what changes for someone after they watch it.",
      },
      {
        id: id("brand"),
        label: "Tone of voice",
        value: "e.g. direct, warm, a little dry — the three words that describe how the brand talks.",
      },
      { id: id("brand"), label: "Fonts", value: "Primary: [font name] · Secondary: [font name]" },
      { id: id("brand"), label: "Colour palette", value: "e.g. Navy, cream, gold accent" },
      {
        id: id("brand"),
        label: "Design style",
        value: "Clean and editorial — minimal texture, high contrast, no clutter.",
      },
      {
        id: id("brand"),
        label: "Sound design",
        value: "Vocals-forward, subtle SFX, no trending stock audio.",
      },
      {
        id: id("brand"),
        label: "Backgrounds / set style",
        value: "Studio or in-office — consistent lighting and set across every piece.",
      },
      {
        id: id("brand"),
        label: "Faces of the brand",
        value: "Who's on camera — founder, team, community, or a mix.",
      },
      {
        id: id("brand"),
        label: "The 'energy'",
        value: "One line on how it should feel to watch — confident? warm? elevated?",
      },
      {
        id: id("brand"),
        label: "What we're NOT",
        value: "The one thing this account should never look or sound like.",
      },
      {
        id: id("brand"),
        label: "Positioning statement",
        value: "The one-paragraph promise this account makes to its audience.",
      },
    ],
  },

  pillars: {
    tag: "The shot list",
    heading: "Content pillars",
    desc: "Allocation is weighted toward proof first — because the people who matter most right now are prospects deciding whether to hire you — with room kept for the values-led content that can travel furthest when it lands.",
    items: [
      {
        id: id("pillar"),
        name: "Client Work",
        pct: 40,
        subtitle: "The proof reel",
        description:
          "Results, before/afters, finished pieces, client logos. This is what actually gets sent in a DM to close a deal — treat every project as its own launch, not a grid filler.",
        tags: ["Result-led Reel", "Brief vs. delivery", "Client logo carousel"],
        color: "var(--red)",
      },
      {
        id: id("pillar"),
        name: "Craft & Process",
        pct: 25,
        subtitle: "How it's actually made",
        description:
          "Colour grade breakdowns, rig and lighting setups, sped-up edit timelines. This is what positions Advatar as the technically serious option, not just a nice-looking page.",
        tags: ["Grade split-screen", "On-set BTS", "Edit timelapse"],
        color: "var(--ink)",
      },
      {
        id: id("pillar"),
        name: "The Build",
        pct: 20,
        subtitle: "Bringing people along",
        description:
          "The expansion story — new clients signed, new hires, milestones, the push past the UK. This is what turns followers into people invested in Advatar's trajectory, not just its output.",
        tags: ["Milestone post", "Team intro", "Why we said yes/no"],
        color: "var(--gold)",
      },
      {
        id: id("pillar"),
        name: "The Standard",
        pct: 15,
        subtitle: "How we work, on purpose",
        description:
          "The stance, stated plainly and occasionally: no trending audio, no relying on faces to do the hook's job. Used deliberately rather than constantly — this is the one with real viral upside because it's a real position, not a gimmick.",
        tags: ["Direct POV Reel", "What we won't do", "Industry commentary"],
        color: "var(--red-deep)",
      },
    ],
  },

  format: {
    tag: "Cadence",
    heading: "Format mix, weekly",
    desc: "Weighted toward Reels since that's both your production strength and the format Instagram is pushing hardest for reach right now. Every Reel gets cut for TikTok and YouTube Shorts too — same footage, near-zero extra cost, wider net for inbound.",
    stats: [
      { value: "5–6", label: "Posts / week" },
      { value: "65%", label: "Reels" },
      { value: "25%", label: "Carousels" },
      { value: "10%", label: "Static / announcement" },
      { value: "Daily", label: "Stories" },
    ],
  },

  schedule: {
    tag: "90 days, three acts",
    heading: "The shooting schedule",
    desc: "Act I is the launch sequence we already mapped out. Acts II and III are where the pillars settle into rhythm and the expansion story gets louder.",
    acts: [
      {
        id: id("act"),
        tabLabel: "Act I — Weeks 1–4",
        weeks: [
          {
            id: id("week"),
            weekLabel: "WK 01",
            weekSub: "FOUNDATION",
            title: "Profile reset + the trailer goes live",
            description:
              "Bio, highlights, business account fixed first. Cut and post the 60–90s sizzle reel across two years of work. Pin it. Push it hard on Stories that same day.",
          },
          {
            id: id("week"),
            weekLabel: "WK 02",
            weekSub: "HERO 01",
            title: "First hero project rollout",
            description:
              "Pick your strongest single client project. Result Reel, BTS carousel, Story arc showing the process. One project, full spotlight.",
          },
          {
            id: id("week"),
            weekLabel: "WK 03",
            weekSub: "HERO 02",
            title: "Second hero project + first Craft post",
            description:
              "Repeat the pattern with project two. Slot in your first pure Craft & Process piece — a grade breakdown or gear setup.",
          },
          {
            id: id("week"),
            weekLabel: "WK 04",
            weekSub: "HERO 03",
            title: "Third hero project + review",
            description:
              "Third project spotlight. End the month checking saves/shares per post to see which pillar is actually earning attention before Act II locks in cadence.",
          },
        ],
      },
      {
        id: id("act"),
        tabLabel: "Act II — Weeks 5–8",
        weeks: [
          {
            id: id("week"),
            weekLabel: "WK 05–06",
            weekSub: "ROTATION",
            title: "Full pillar rotation begins",
            description:
              "Settle into the 5–6 posts/week mix across all four pillars at their target allocation. Fourth and fifth hero projects roll in as part of the Client Work slot rather than as standalone launches.",
          },
          {
            id: id("week"),
            weekLabel: "WK 07",
            weekSub: "THE STANDARD",
            title: "First deliberate Standard post",
            description:
              "Publish the first direct POV piece on the no-music, no-filler-faces approach. Give it room — don't bury it in a carousel, let it be its own Reel.",
          },
          {
            id: id("week"),
            weekLabel: "WK 08",
            weekSub: "DOUBLE DOWN",
            title: "Lean into what's working",
            description:
              "By now you'll have real data. Shift the following two weeks' production toward whichever pillar/format is driving DMs and saves, without abandoning the others entirely.",
          },
        ],
      },
      {
        id: id("act"),
        tabLabel: "Act III — Weeks 9–13",
        weeks: [
          {
            id: id("week"),
            weekLabel: "WK 09–10",
            weekSub: "THE BUILD",
            title: "Turn up the expansion story",
            description:
              "More Build-pillar content — where Advatar is headed beyond the UK, new capacity, new hires. This is what gets a following invested rather than just watching.",
          },
          {
            id: id("week"),
            weekLabel: "WK 11",
            weekSub: "UGC / TAGS",
            title: "Ask clients to tag you",
            description:
              "Start prompting happy clients to repost or tag Advatar when they share the finished work — cheap, credible reach that doesn't cost production time.",
          },
          {
            id: id("week"),
            weekLabel: "WK 12",
            weekSub: "FLAGSHIP 02",
            title: "Second flagship reel",
            description:
              "A bigger, more ambitious piece than the original trailer — this time built to be the one that travels, leaning on the Standard positioning if the data says it resonates.",
          },
          {
            id: id("week"),
            weekLabel: "WK 13",
            weekSub: "REVIEW",
            title: "90-day review",
            description:
              "Pull the metrics below, see what actually moved, and set pillar weightings for the next quarter based on evidence instead of guesswork.",
          },
        ],
      },
    ],
  },

  workflow: {
    tag: "Production line",
    heading: "Weekly workflow",
    desc: "Built around you plus editing help — not a full in-house team.",
    steps: [
      {
        id: id("wf"),
        num: "01",
        title: "Batch shoot",
        description:
          "Capture BTS and finished-project footage across client work as it happens — don't shoot separately for the page.",
      },
      {
        id: id("wf"),
        num: "02",
        title: "Hand off to edit",
        description: "Editor cuts against the week's pillar assignment — footage in, Reel/carousel out, same brief every time.",
      },
      {
        id: id("wf"),
        num: "03",
        title: "Approve & caption",
        description: "You review, write the caption/hook, and slot it into the week's format mix.",
      },
      {
        id: id("wf"),
        num: "04",
        title: "Post & engage",
        description: "10–15 minutes daily replying to DMs and comments — this is where prospects actually convert.",
      },
    ],
  },

  metrics: {
    tag: "What actually matters",
    heading: "Metrics to track",
    desc: "Followers are the least important number here — DMs and saves are the ones tied to your real goals.",
    items: [
      { id: id("metric"), label: "DMs / inquiries", value: "Weekly" },
      { id: id("metric"), label: "Saves + shares / post", value: "Weekly" },
      { id: id("metric"), label: "Profile → link clicks", value: "Weekly" },
      { id: id("metric"), label: "Follower growth", value: "Monthly" },
    ],
  },

  competitors: {
    tag: "Competitive scan",
    heading: "What competitors are posting",
    desc: "Log anything worth studying — Google Drive, TikTok, Instagram, YouTube, wherever it lives. Just the link and a note on why it's here.",
    links: [
      { id: id("link"), title: "Studio A — @studio-a", url: "" },
      { id: id("link"), title: "Studio B — @studio-b", url: "" },
      { id: id("link"), title: "Freelancer C — @freelancer-c", url: "" },
    ],
  },

  producing: {
    tag: "Proof of work",
    heading: "What we're producing",
    desc: "The other side of the comparison — log finished pieces as they come off the line, same way: title, link, done.",
    links: [
      { id: id("link"), title: "Hero project 01 — client name", url: "" },
      { id: id("link"), title: "Craft breakdown — grade / rig walkthrough", url: "" },
      { id: id("link"), title: "The Standard — direct POV piece", url: "" },
    ],
  },

  slots: {
    tag: "Monthly output",
    heading: "Video slot planner",
    desc: "Set how many finished videos you're committing to this month. Each slot carries its own brief — hook, body, CTA, WMS and scenery — plus the shoot it belongs to and a spot for the link once it's done.",
    items: Array.from({ length: 12 }, (_, i) => ({
      id: id("slot"),
      title: `Video ${String(i + 1).padStart(2, "0")}`,
      description: "What this video covers, in a line or two.",
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
    desc: "A quick-glance version of the engagement — swap the labels and milestones per client, add or remove steps as needed.",
    items: [
      {
        id: id("tl"),
        date: "Week 0",
        title: "Kickoff call",
        description: "Align on goals, brand voice, and get access to footage, accounts, and past client work.",
        done: false,
      },
      {
        id: id("tl"),
        date: "Week 1",
        title: "Foundation",
        description: "Profile reset, bio and highlights fixed, trailer reel shot, edited, and published.",
        done: false,
      },
      {
        id: id("tl"),
        date: "Weeks 2–4",
        title: "Hero rollout",
        description: "First three hero client projects launched, one per week, to build initial momentum.",
        done: false,
      },
      {
        id: id("tl"),
        date: "Month 2",
        title: "Full rotation",
        description: "Pillar mix settles into a steady weekly cadence based on what the first month showed us.",
        done: false,
      },
      {
        id: id("tl"),
        date: "Month 3",
        title: "Review & scale",
        description: "90-day review, results shared, and the next quarter planned around what actually worked.",
        done: false,
      },
    ],
  },

  guarantee: {
    tag: "The fine print, kept short",
    heading: "Our guarantee",
    body: "If the pillar mix above doesn't produce a measurable lift in inbound DMs within 90 days, we keep producing at no extra cost until it does — in writing, before a single frame is shot.",
    terms: [
      { id: id("term"), text: "No lock-in contract — reviewed and renewed month to month." },
      { id: id("term"), text: "Any underperforming piece gets reshot at no extra cost." },
      { id: id("term"), text: "Direct line to your editor throughout — no account manager layer." },
    ],
  },
};

export function makeId(prefix: string) {
  return id(prefix);
}
