"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubmissionVisibility } from "@/lib/supabase/types";
import type { PlanSlotChoice } from "@/lib/uploads";
import { loadVideographerShare } from "@/lib/team-access";

/**
 * These were `/app/my-work`'s actions until the Uploads tab took the
 * submission workflow over. They moved rather than being copied so
 * there is still exactly one place that knows how handing work in
 * works — the thing this app's conventions care about most.
 */
export interface SubmitWorkInput {
  title: string;
  clientId: string;
  url: string;
  notes: string;
  visibility: SubmissionVisibility;
  /**
   * Which slot on the client's content plan this video is.
   *
   * A slot id puts it in that exact slot. "new" adds a slot for it.
   * "" leaves the plan alone — not every upload is a planned video.
   *
   * Before this, the plan was filled by guessing: the slot whose
   * wording overlapped the submission's title most. That guess is
   * still the fallback for a video handed in without a choice (and
   * for everything submitted before this existed), but a guess is a
   * poor thing to have standing between a finished video and the
   * client's plan — it could fill in the wrong one, which silently
   * marks a video they are still waiting for as delivered.
   */
  plannerSlotId?: string;
  /** 0042: what is being delivered. Defaults to a video. */
  kind?: "video" | "thumbnail" | "graphic";
  /**
   * 0042: an optional Cloudinary (or other direct video) link the
   * client watches in the app's own player, which can read where they
   * paused. `url` stays the Google Drive link they download from.
   */
  streamUrl?: string;
}

export type SubmitWorkResult =
  | { ok: true; note: string | null }
  | { ok: false; error: string };

/**
 * Handing work in.
 *
 * This moved out of the browser and into a server action because
 * submitting is no longer one insert. Three things now happen
 * together, and two of them a videographer has no business being able
 * to do directly:
 *
 *   1. the submission and its first version  — as the caller, so
 *      `submissions`' RLS (0020) still decides whether it is allowed;
 *   2. filling the matching content plan slot — planners are
 *      management-writable only, so this uses the admin client, and
 *      only ever writes the link for a video the videographer just
 *      submitted against a client they are already on;
 *   3. telling the client                     — `notifications` has no
 *      insert policy for anybody at all, on purpose.
 *
 * Steps 2 and 3 only run for a submission shared with the client. A
 * team-only submission is work in progress: it should not appear on
 * the plan the client reads, and nobody should be emailed about it.
 */
export async function submitWorkAction(input: SubmitWorkInput): Promise<SubmitWorkResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You are signed out. Sign in and try again." };

  const title = input.title.trim();
  const url = input.url.trim();
  const notes = input.notes.trim();
  const clientId = input.clientId.trim();
  const visibility: SubmissionVisibility =
    input.visibility === "team_and_client" ? "team_and_client" : "team_only";

  if (!title) return { ok: false, error: "Give it a title." };
  // Required as of prompt 11: a submission with no client can't be
  // matched to a plan, shown to anyone, or chased.
  if (!clientId) return { ok: false, error: "Pick which client this is for." };
  if (!url) return { ok: false, error: "Paste the link to the video." };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: "The link should start with http:// or https://" };
  }
  const streamUrl = (input.streamUrl ?? "").trim();
  if (streamUrl && !/^https:\/\//i.test(streamUrl)) {
    return { ok: false, error: "The player link should start with https://" };
  }
  const kind = input.kind === "thumbnail" || input.kind === "graphic" ? input.kind : "video";

  // 0047: a videographer sends work to the client only if the CEO has
  // switched that on for them. The database refuses it anyway; this
  // just says why in plain words.
  if (visibility === "team_and_client") {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if ((me as { role?: string } | null)?.role === "videographer") {
      const { canShare } = await loadVideographerShare(supabase, user.id);
      if (!canShare) {
        return { ok: false, error: "You can’t send videos straight to the client. Choose “CEO and team only” and they’ll send it on once it’s approved." };
      }
    }
  }

  const { data: created, error: createError } = await supabase
    .from("submissions")
    .insert({
      title,
      client_id: clientId,
      created_by: user.id,
      status: "submitted",
      visibility,
    })
    .select("id")
    .single();

  if (createError || !created) {
    if (createError && /row-level security/i.test(createError.message) && visibility === "team_and_client") {
      return { ok: false, error: "You can’t send videos straight to the client. Choose “CEO and team only” and they’ll send it on once it’s approved." };
    }
    return { ok: false, error: createError?.message ?? "Could not save that." };
  }

  const submissionId = (created as { id: string }).id;

  const { error: versionError } = await supabase.from("submission_versions").insert({
    submission_id: submissionId,
    version: 1,
    url,
    notes: notes || null,
    submitted_by: user.id,
  });

  if (versionError) {
    return { ok: false, error: `Saved, but the link didn't attach: ${versionError.message}` };
  }

  // 0042's columns, written separately and allowed to fail: before the
  // migration they do not exist, and PostgREST would reject the whole
  // insert above over one unknown column. The admin client because a
  // videographer has no update policy on submissions; both rows were
  // created by this request a moment ago.
  if (kind !== "video" || streamUrl) {
    const admin = createAdminClient();
    if (kind !== "video") await admin.from("submissions").update({ kind }).eq("id", submissionId);
    if (streamUrl) {
      await admin
        .from("submission_versions")
        .update({ stream_url: streamUrl })
        .eq("submission_id", submissionId)
        .eq("version", 1);
    }
  }

  const chosenSlot = (input.plannerSlotId ?? "").trim();

  let note: string | null = null;

  // 0042: a video on the schedule. Linked straight away whoever can
  // see it — the schedule shows "uploaded, not shared" to the team and
  // still "in production" to the client until it is shared.
  if (chosenSlot.startsWith("v:") || (chosenSlot === "new" && (await scheduleAvailable()))) {
    note = await linkScheduledVideo({ clientId, submissionId, title, chosenSlot });
    if (visibility === "team_and_client") await notifyClient({ clientId, title, actorId: user.id });
  } else if (visibility === "team_and_client") {
    note = await fillPlannerSlot({ clientId, submissionId, title, url, chosenSlot });
    await notifyClient({ clientId, title, actorId: user.id });
  } else if (chosenSlot && chosenSlot !== "new") {
    // Team-only: the plan is the CLIENT's document, and work still
    // being reviewed has no business appearing on it as delivered.
    // The choice is remembered on the submission instead, so sharing
    // it later fills the slot that was picked now rather than falling
    // back to guessing from the title.
    await createAdminClient()
      .from("submissions")
      .update({ planner_slot_id: chosenSlot })
      .eq("id", submissionId);

    note = "Saved. It'll go into that slot on their plan when you share it.";
  }

  revalidatePath("/app/uploads");

  return { ok: true, note };
}

/**
 * The slots on a client's content plan, for the upload form's picker.
 *
 * Read as the caller so the plan's own RLS decides: management sees
 * every client's, a videographer only the clients they are on, and
 * nobody gets a plan they could not already open. Returns an empty
 * list rather than an error when there is no plan yet — the form
 * simply offers "add it as a new video" in that case.
 */
export async function planSlotsAction(clientId: string): Promise<PlanSlotChoice[]> {
  if (!clientId.trim()) return [];

  const supabase = createClient();

  // 0042: the video schedule, soonest first, undated last. Falls back
  // to the content plan's old slot list before the migration runs.
  const { data: scheduled, error: scheduleError } = await supabase
    .from("content_videos")
    .select("id, publish_on, title, pillar, submission_id")
    .eq("client_id", clientId)
    .order("publish_on", { ascending: true, nullsFirst: false });

  if (!scheduleError) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = (scheduled ?? []) as {
      id: string;
      publish_on: string | null;
      title: string | null;
      pillar: string | null;
      submission_id: string | null;
    }[];
    // Outstanding ones first: those are what an upload is usually for.
    const ordered = [
      ...rows.filter((r) => !r.submission_id && (!r.publish_on || r.publish_on >= today)),
      ...rows.filter((r) => !r.submission_id && r.publish_on && r.publish_on < today),
      ...rows.filter((r) => r.submission_id),
    ];
    return ordered.map((r) => {
      const day = r.publish_on
        ? new Date(`${r.publish_on}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
        : "No date";
      const name = [r.pillar, r.title].filter((x) => x && x.trim()).join(" · ") || "Video";
      return { id: `v:${r.id}`, label: `${day} · ${name}`, filled: Boolean(r.submission_id) };
    });
  }

  const { data: planner } = await supabase
    .from("planners")
    .select("content")
    .eq("client_id", clientId)
    .maybeSingle();

  const content = ((planner as { content?: unknown } | null)?.content ?? {}) as Record<string, unknown>;
  const slots = content.slots as { items?: PlannerSlotRow[] } | undefined;
  const items = Array.isArray(slots?.items) ? slots!.items! : [];

  return items
    .filter((slot): slot is PlannerSlotRow => Boolean(slot && typeof slot.id === "string" && slot.id))
    .map((slot, i) => {
      const number = String(i + 1).padStart(2, "0");
      const name = (slot.title ?? "").trim() || (slot.description ?? "").trim().slice(0, 48);
      return {
        id: slot.id,
        // Numbered the way the plan numbers them, so the thing picked
        // here is findable by eye on the plan itself.
        label: name ? `${number} \u00b7 ${name}` : `${number} \u00b7 (untitled slot)`,
        filled: Boolean((slot.link ?? "").trim()),
      };
    });
}

/**
 * Sharing a submission with the client after the fact.
 *
 * The common path is: hand it in team-only, get it reviewed, then let
 * the client see it. Without this a team-only submission could never
 * reach them, and the reviewer would have to ask for it to be
 * submitted a second time.
 *
 * Only a reviewer may do this — `submissions`' update policy (0020)
 * gives a videographer none at all, so the update below simply
 * affects no rows for anybody else, and the planner and notification
 * steps are gated on it having worked.
 */
export async function shareWithClientAction(submissionId: string): Promise<SubmitWorkResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You are signed out. Sign in and try again." };

  // Showing a video to the client is approving it, and that is the
  // CEO's or operations' call (0060 enforces it in the database too).
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "ceo" && role !== "operations_manager") {
    return { ok: false, error: "Only the CEO or operations can approve a video for the client." };
  }

  const { data: updated, error } = await supabase
    .from("submissions")
    .update({ visibility: "team_and_client", status: "approved" } as never)
    .eq("id", submissionId)
    .select("id, title, client_id, planner_slot_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "You don't have permission to share that." };

  const row = updated as {
    id: string;
    title: string;
    client_id: string | null;
    planner_slot_id: string | null;
  };
  if (!row.client_id) return { ok: false, error: "That submission has no client on it." };

  const { data: latest } = await supabase
    .from("submission_versions")
    .select("url")
    .eq("submission_id", row.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const url = (latest as { url: string | null } | null)?.url ?? null;

  const note = url
    ? await fillPlannerSlot({
        clientId: row.client_id,
        submissionId: row.id,
        title: row.title,
        url,
        // The slot picked when it was handed in, if there was one.
        // Without this, sharing a team-only upload later went back to
        // guessing from the title and could ignore a choice already
        // made.
        chosenSlot: row.planner_slot_id ?? "",
      })
    : null;

  // No notifyClient() here any more. The update above trips
  // `submissions_shared_notify` (0028), which tells every login on
  // that client and points them at their own Uploads tab. Calling it
  // from here too would send the same person the same thing twice.

  revalidatePath("/app/uploads");
  revalidatePath("/app/portal/uploads");
  revalidatePath("/app/clients");

  return { ok: true, note };
}

/**
 * Puts the link on the client's content plan.
 *
 * The plan's slots live in `planners.content -> 'slots' -> 'items'` as
 * a jsonb array, not a table, so this reads the document, changes one
 * entry and writes it back. An unfulfilled slot is one with an empty
 * `link` — that is precisely what "planned but not delivered" means in
 * this schema.
 *
 * Matching is deliberately conservative. A slot is only claimed when
 * its title or description genuinely overlaps the submission's title;
 * otherwise a new slot is appended. Filling in the wrong slot is worse
 * than adding one, because it silently marks a video the client is
 * still waiting for as delivered.
 */
async function fillPlannerSlot({
  clientId,
  submissionId,
  title,
  url,
  chosenSlot = "",
}: {
  clientId: string;
  submissionId: string;
  title: string;
  url: string;
  /** A slot id, "new", or "" to fall back to matching on the title. */
  chosenSlot?: string;
}): Promise<string | null> {
  // Nothing on the plan, by choice. Not every upload is one of the
  // planned videos -- a re-cut for internal use, a one-off ad.
  if (chosenSlot === "none") return null;

  const admin = createAdminClient();

  const { data: planner } = await admin
    .from("planners")
    .select("id, content")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!planner) return null;

  const content = (planner.content ?? {}) as Record<string, unknown>;
  const slots = content.slots as { items?: PlannerSlotRow[] } | undefined;
  const items = Array.isArray(slots?.items) ? [...slots!.items!] : null;

  if (!items) return null;

  // What the person actually picked wins over the guess. "new" skips
  // the search outright and appends; a slot id is honoured even when
  // that slot already has a link on it, because replacing a delivered
  // video with a better cut is a normal thing to want and the person
  // choosing it can see it is already filled.
  const index =
    chosenSlot === "new"
      ? -1
      : chosenSlot
        ? items.findIndex((slot) => slot.id === chosenSlot)
        : bestMatch(items, title);

  if (index >= 0) {
    items[index] = { ...items[index], link: url };
  } else {
    items.push({
      id: `slot-${submissionId.slice(0, 8)}`,
      title,
      description: "Added from a submission.",
      pillar: "",
      link: url,
    });
  }

  const { error } = await admin
    .from("planners")
    .update({ content: { ...content, slots: { ...(slots ?? {}), items } } })
    .eq("id", planner.id);

  if (error) return null;

  await admin.from("submissions").update({ planner_slot_id: items[index >= 0 ? index : items.length - 1].id }).eq("id", submissionId);

  return index >= 0
    ? `Filled in “${items[index].title}” on their content plan.`
    : "Added it to their content plan as a new slot.";
}

interface PlannerSlotRow {
  id: string;
  title: string;
  description: string;
  pillar: string;
  link: string;
}

/**
 * The index of the unfulfilled slot this submission belongs to, or -1.
 *
 * Scored on shared significant words rather than an exact string
 * match: "Bright Co — March Reel" should find the slot described as
 * "March reel for Bright Co", and should not find "Founder interview".
 * The threshold is two shared words, or one when the slot's title is a
 * single distinctive word.
 */
function bestMatch(items: PlannerSlotRow[], title: string): number {
  const wanted = significantWords(title);
  if (wanted.size === 0) return -1;

  let best = -1;
  let bestScore = 0;

  items.forEach((slot, i) => {
    // Only unfulfilled slots. A slot with a link is already delivered.
    if (slot.link && slot.link.trim()) return;

    const candidate = significantWords(`${slot.title} ${slot.description}`);
    let score = 0;
    for (const word of wanted) if (candidate.has(word)) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return bestScore >= 2 ? best : -1;
}

// "Video 01" and "What this video covers, in a line or two." are the
// stock placeholder text every plan starts with — matching on them
// would claim an arbitrary empty slot for every submission.
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "this",
  "that", "what", "covers", "line", "two", "video", "videos", "reel", "content",
]);

function significantWords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
  );
}

/**
 * Tells the client's logins that something has been shared with them.
 *
 * Written with the admin client because `notifications` grants insert
 * to nobody — a login that could write them could write them to other
 * people. Everything this inserts is derived from the submission that
 * was just created, not from anything the caller passed in freely.
 */
async function notifyClient({
  clientId,
  title,
  actorId,
}: {
  clientId: string;
  title: string;
  actorId: string;
}) {
  const admin = createAdminClient();

  const { data: recipients } = await admin.from("profiles").select("id").eq("role", "client").eq("client_id", clientId);

  const rows = ((recipients ?? []) as { id: string }[])
    .filter((p) => p.id !== actorId)
    .map((p) => ({
      user_id: p.id,
      kind: "submission_shared",
      title: "New video ready to watch",
      // The company, not one person: clients deal with a team.
      body: `Your team has shared “${title}” with you.`,
      href: "/app/portal/videos",
      email_pending: true,
    }));

  if (rows.length === 0) return;

  await admin.from("notifications").insert(rows);
}

/** True once 0042 has been run. */
async function scheduleAvailable(): Promise<boolean> {
  const { error } = await createAdminClient().from("content_videos").select("id").limit(1);
  return !error;
}

/**
 * Links an upload to a video on the schedule (0042), or adds one.
 *
 * The admin client, because a videographer can read the schedule but
 * not write it. Safe: the video must belong to the same client the
 * upload was just created for, which the caller's own RLS already
 * allowed them to submit against.
 */
async function linkScheduledVideo({
  clientId,
  submissionId,
  title,
  chosenSlot,
}: {
  clientId: string;
  submissionId: string;
  title: string;
  chosenSlot: string;
}): Promise<string | null> {
  const admin = createAdminClient();

  if (chosenSlot === "new") {
    const { error } = await admin
      .from("content_videos")
      .insert({ client_id: clientId, title, submission_id: submissionId });
    return error ? null : "Added to their video schedule without a date — give it a day on their Videos tab.";
  }

  const videoId = chosenSlot.slice(2);
  const { data, error } = await admin
    .from("content_videos")
    .update({ submission_id: submissionId })
    .eq("id", videoId)
    .eq("client_id", clientId)
    .select("publish_on")
    .maybeSingle();

  if (error || !data) return "Saved, but it couldn’t be linked to that video — link it from their Videos tab.";
  const day = (data as { publish_on: string | null }).publish_on;
  return day
    ? `Linked to the video going out on ${new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}.`
    : "Linked to that video on their schedule.";
}
