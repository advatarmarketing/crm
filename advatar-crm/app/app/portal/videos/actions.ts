"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * The client's two moves on a video: leave a note (optionally pinned
 * to a moment), or give a verdict. Both run as the client, so 0042
 * decides — a client we post for cannot do either, an approve-only
 * client can approve but not leave change notes, and a full-revisions
 * client is held to their number of rounds.
 */

export interface ClientReviewResult {
  error: string | null;
}

function plain(message: string): string {
  if (/row-level security|violates row-level/i.test(message)) {
    return "Notes on videos aren’t part of your package. Message your team if something needs changing.";
  }
  if (/client_decide_submission|function .* does not exist|could not find the function/i.test(message)) {
    return "Approving isn’t switched on yet. Message your team instead and they’ll take care of it.";
  }
  // Raised by client_decide_submission itself, already in plain words.
  return message.replace(/^.*?ERROR:\s*/i, "");
}

export async function clientDecideAction(
  submissionId: string,
  decision: "approved" | "changes_requested",
  note: string
): Promise<ClientReviewResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You’re signed out. Sign in and try again." };

  // The hand-written Database type has no Functions entry for this
  // (see lib/supabase/admin.ts), so the call is untyped on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("client_decide_submission", {
    target_submission_id: submissionId,
    decision,
    note: note.trim() || null,
  });
  if (error) return { error: plain(error.message) };

  revalidatePath("/app/portal/videos");
  revalidatePath("/app/portal");
  return { error: null };
}

export async function clientNoteAction(
  submissionId: string,
  version: number,
  body: string,
  timecodeSeconds: number | null
): Promise<ClientReviewResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You’re signed out. Sign in and try again." };

  const text = body.trim();
  if (!text) return { error: "Write what you’d like changed." };

  const row: Record<string, unknown> = {
    submission_id: submissionId,
    version,
    body: text.slice(0, 4000),
    author_id: user.id,
    audience: "client",
  };
  if (timecodeSeconds !== null && Number.isFinite(timecodeSeconds) && timecodeSeconds >= 0) {
    row.timecode_seconds = Math.floor(timecodeSeconds);
  }

  const { error } = await supabase.from("submission_feedback").insert(row as never);
  if (error) return { error: plain(error.message) };

  revalidatePath("/app/portal/videos");
  return { error: null };
}
