"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/names";
import type { SubmissionVisibility } from "@/lib/supabase/types";

export interface SubmitWorkInput {
  title: string;
  clientId: string;
  url: string;
  notes: string;
  visibility: SubmissionVisibility;
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

  let note: string | null = null;

  if (visibility === "team_and_client") {
    note = await fillPlannerSlot({ clientId, submissionId, title, url });
    await notifyClient({ clientId, title, actorId: user.id });
  }

  revalidatePath("/app/my-work");

  return { ok: true, note };
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

  const { data: updated, error } = await supabase
    .from("submissions")
    .update({ visibility: "team_and_client" })
    .eq("id", submissionId)
    .select("id, title, client_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "You don't have permission to share that." };

  const row = updated as { id: string; title: string; client_id: string | null };
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
    ? await fillPlannerSlot({ clientId: row.client_id, submissionId: row.id, title: row.title, url })
    : null;

  await notifyClient({ clientId: row.client_id, title: row.title, actorId: user.id });

  revalidatePath("/app/my-work");
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
}: {
  clientId: string;
  submissionId: string;
  title: string;
  url: string;
}): Promise<string | null> {
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

  const index = bestMatch(items, title);

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

  const [{ data: recipients }, { data: actor }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "client").eq("client_id", clientId),
    admin.from("profiles").select("full_name").eq("id", actorId).maybeSingle(),
  ]);

  const rows = ((recipients ?? []) as { id: string }[])
    .filter((p) => p.id !== actorId)
    .map((p) => ({
      user_id: p.id,
      kind: "submission_shared",
      title: "New video ready to watch",
      body: `${displayName(actor?.full_name ?? null)} has shared “${title}” with you.`,
      href: "/app/portal",
      email_pending: true,
    }));

  if (rows.length === 0) return;

  await admin.from("notifications").insert(rows);
}
