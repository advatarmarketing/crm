import { DEFAULT_PLANNER_CONTENT, type PlannerContent } from "./content";

/**
 * !! UNVERIFIED AGAINST A REAL FATHOM PAYLOAD !!
 *
 * Nobody on this build has seen an actual Fathom AI webhook body — no
 * sample, no docs page fetched, nothing. Everything below is written
 * defensively (lots of optional chaining and fallbacks across several
 * *guessed* possible field names) specifically so it degrades to "map
 * nothing, keep the safe defaults" rather than throwing or silently
 * mis-mapping, if the real shape doesn't match these guesses. Before
 * this goes live: trigger one real call through Fathom, log
 * `JSON.stringify(payload)` from the route handler, and rewrite the
 * field lookups in `readFathomPayload()` below to match reality. Do
 * not trust the specific field names here.
 */

export interface FathomAttendee {
  name?: string;
  email?: string;
}

export interface FathomFields {
  callId: string | null;
  meetingTitle: string | null;
  summary: string | null;
  actionItems: unknown;
  transcriptUrl: string | null;
  attendees: FathomAttendee[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Pulls the fields we care about out of whatever shape the payload
 * turns out to be, trying a handful of plausible field names for
 * each. Every lookup here is a guess pending a real sample.
 */
export function readFathomPayload(payload: any): FathomFields {
  const callId = str(payload?.id) ?? str(payload?.call_id) ?? str(payload?.recording_id) ?? str(payload?.meeting_id);

  const meetingTitle = str(payload?.meeting_title) ?? str(payload?.title) ?? str(payload?.name);

  const summary =
    str(payload?.summary) ?? str(payload?.ai_summary) ?? str(payload?.meeting_summary) ?? str(payload?.default_summary?.markdown_formatted);

  const actionItems = payload?.action_items ?? payload?.actionItems ?? payload?.tasks ?? null;

  const transcriptUrl =
    str(payload?.transcript_url) ?? str(payload?.transcript?.url) ?? str(payload?.recording_url) ?? str(payload?.share_url) ?? str(payload?.url);

  const rawAttendees = payload?.attendees ?? payload?.invitees ?? payload?.participants ?? [];
  const attendees: FathomAttendee[] = Array.isArray(rawAttendees)
    ? rawAttendees
        .map((a: any) => ({ name: str(a?.name) ?? undefined, email: str(a?.email) ?? undefined }))
        .filter((a: FathomAttendee) => a.name || a.email)
    : [];

  return { callId, meetingTitle, summary, actionItems, transcriptUrl, attendees };
}

export interface MappedClientFields {
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  next_action: string;
}

export interface MappingResult {
  client: MappedClientFields;
  plannerContent: PlannerContent;
  /** Human-readable notes on what was/wasn't mapped, for logging only — not stored anywhere yet. */
  notes: string[];
}

function actionItemLines(actionItems: unknown): string[] {
  if (!Array.isArray(actionItems)) return [];
  return actionItems
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        return str(obj.description) ?? str(obj.text) ?? str(obj.title) ?? null;
      }
      return null;
    })
    .filter((s): s is string => Boolean(s));
}

const CONTENT_IDEA_KEYWORDS = ["reel", "video", "content", "post", "carousel", "shoot", "pillar", "story", "clip"];

function looksLikeContentIdea(line: string): boolean {
  const lower = line.toLowerCase();
  return CONTENT_IDEA_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Builds a brand-new client + a draft planner pre-filled ONLY where
 * we have something concrete and attributable from the call — never
 * a guess dressed up as content. Everything else stays exactly at
 * DEFAULT_PLANNER_CONTENT's template wording, for a human to fill in
 * during the review step at /app/prospects.
 */
export function mapFathomToPlanner(payload: any): MappingResult {
  const fields = readFathomPayload(payload);
  const notes: string[] = [];

  const primaryAttendee = fields.attendees[0];

  const client: MappedClientFields = {
    name: fields.meetingTitle ?? primaryAttendee?.name ?? "New prospect (from Fathom call)",
    contact_name: primaryAttendee?.name ?? null,
    contact_email: primaryAttendee?.email ?? null,
    next_action: "Review this prospect's auto-created plan and confirm the details before publishing.",
  };
  if (!fields.meetingTitle && !primaryAttendee?.name) {
    notes.push("No meeting title or attendee name found — client name left as a generic placeholder.");
  }

  // Deep clone so we never mutate the shared default template object.
  const content: PlannerContent = JSON.parse(JSON.stringify(DEFAULT_PLANNER_CONTENT));

  // High confidence: the call happened, so the hero/eyebrow can
  // reasonably say so, using only fields we actually have.
  if (fields.meetingTitle) {
    content.hero.scene = "Discovery call";
    content.hero.sub = `90-day production schedule — from the "${fields.meetingTitle}" discovery call`;
  } else {
    notes.push("No meeting title — hero left at template defaults.");
  }

  // Agreed next steps → schedule section description. This is the
  // one explicitly named in the spec, and action_items is the most
  // structured, least-guessable field Fathom is likely to send, so
  // it's the highest-confidence mapping in this file.
  const nextSteps = actionItemLines(fields.actionItems);
  if (nextSteps.length > 0) {
    const bulleted = nextSteps.map((s) => `• ${s}`).join(" ");
    content.schedule.desc = `${content.schedule.desc} Agreed next steps from the discovery call: ${bulleted}`;
    notes.push(`Mapped ${nextSteps.length} action item(s) into schedule.desc.`);
  } else {
    notes.push("No action items found — schedule.desc left at template default.");
  }

  // Mentioned content ideas → a new, clearly-labeled pillar with
  // pct=0 so it never silently steals budget from the four default
  // pillars' allocations. Only created if we found at least one
  // action item that reads like a content idea by keyword match —
  // deliberately low-recall (misses plenty of real ideas) rather
  // than high-recall (which would risk pulling in irrelevant lines).
  const ideaLines = nextSteps.filter(looksLikeContentIdea);
  if (ideaLines.length > 0) {
    content.pillars.items.push({
      id: `pillar-fathom-${Date.now()}`,
      name: "From discovery call",
      pct: 0,
      subtitle: "Unreviewed — ideas mentioned on the call",
      description: "Auto-added from the discovery call transcript. Confirm these are real content ideas, fold them into an existing pillar or delete this card, and set a real percentage before publishing.",
      tags: ideaLines,
      color: "var(--coral)",
    });
    notes.push(`Added ${ideaLines.length} content-idea tag(s) as a new 0%-weighted pillar for review.`);
  } else {
    notes.push("No content-idea-shaped action items found — pillars left at template defaults.");
  }

  // Discussed goals → mission statement. This is the lowest-
  // confidence mapping of the three named in the spec, because
  // "goals" have no structured field to read from — only the
  // freeform summary. Rather than guess which sentence is "the"
  // goal, we only ever act if the summary contains an explicit
  // "goal"/"objective" marker, and even then we copy the literal
  // sentence rather than paraphrasing it.
  if (fields.summary) {
    const goalSentence = fields.summary
      .split(/(?<=[.!?])\s+/)
      .find((s) => /\b(goal|objective|aim(ing)?)\b/i.test(s));
    if (goalSentence) {
      const missionRow = content.branding.rows.find((r) => r.label.toLowerCase().startsWith("mission statement"));
      if (missionRow) {
        missionRow.value = `${goalSentence.trim()} (from the discovery call — confirm wording before publishing.)`;
        notes.push("Mapped a goal-flagged sentence from the summary into the mission statement row.");
      }
    } else {
      notes.push("Summary present but no explicit goal/objective sentence found — mission statement left at template default.");
    }
  } else {
    notes.push("No call summary present — mission statement left at template default.");
  }

  return { client, plannerContent: content, notes };
}
