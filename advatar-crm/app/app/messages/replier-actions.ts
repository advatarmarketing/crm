"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientContext, writeReplies } from "@/lib/replier-server";
import { CHANNELS, MAX_EXTRA, MAX_MESSAGE, REPLYING_AS, RUN_COLUMNS, type Channel, type Playbook, type ReplierExample, type ReplierRun, type ReplyingAs } from "@/lib/replier";

/**
 * Professional Replier (0056). Row level security decides everything:
 * can_use_replier() for using it, is_ceo_role() for the playbook,
 * examples and who has access. These actions only tidy the input and
 * say what went wrong in plain words.
 */

async function signedIn() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const notRun = (m?: string) => /replier_|can_use_replier|does not exist|could not find/i.test(m ?? "");
const NOT_RUN = "The Professional Replier starts once database update 0056 has been run in Supabase.";

export async function generateRepliesAction(input: {
  message: string;
  clientId: string | null;
  replyingAs: ReplyingAs;
  channel: Channel;
  extra: string;
}): Promise<{ error: string | null; run?: ReplierRun }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const message = input.message.trim();
  const extra = input.extra.trim() || null;
  if (!message) return { error: "Paste the client’s message first." };
  if (message.length > MAX_MESSAGE) return { error: "That message is too long. Paste the part that needs a reply." };
  if (extra && extra.length > MAX_EXTRA) return { error: "The note for the replier is too long." };
  if (!REPLYING_AS.some((r) => r.id === input.replyingAs) || !CHANNELS.some((c) => c.id === input.channel)) return { error: "Choose who is replying and where." };

  const { data: allowed, error: accessError } = await supabase.rpc("can_use_replier");
  if (accessError) return { error: notRun(accessError.message) ? NOT_RUN : accessError.message };
  if (!allowed) return { error: "The CEO hasn’t given you the Professional Replier." };

  const [pb, ex, me] = await Promise.all([
    supabase.from("replier_playbook").select("needs_ceo, house_style, never_promise, facts, updated_at").maybeSingle(),
    supabase.from("replier_examples").select("id, client_message, reply, note, created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  if (pb.error) return { error: notRun(pb.error.message) ? NOT_RUN : pb.error.message };
  const playbook = (pb.data ?? { needs_ceo: "", house_style: "", never_promise: "", facts: "", updated_at: null }) as Playbook;
  const context = await clientContext(supabase, input.clientId);

  const written = await writeReplies({
    playbook,
    examples: (ex.data ?? []) as ReplierExample[],
    context: context.text,
    message,
    extra,
    replyingAs: input.replyingAs,
    senderName: (me.data as { full_name: string | null } | null)?.full_name?.trim().split(/\s+/)[0] ?? null,
    channel: input.channel,
    clientId: input.clientId,
  });
  if (!written.ok) return { error: written.error };

  const { data, error } = await supabase
    .from("replier_runs")
    .insert({
      created_by: user.id,
      client_id: input.clientId,
      replying_as: input.replyingAs,
      channel: input.channel,
      client_message: message,
      extra,
      result: written.result,
      needs_ceo: written.result.needs_ceo,
      ceo_reason: written.result.ceo_reason,
      model: written.model,
      cost_usd: Number(written.costUsd.toFixed(6)),
    })
    .select(RUN_COLUMNS)
    .single();
  if (error || !data) return { error: error?.message ?? "The replies couldn’t be saved." };
  const run = data as ReplierRun;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (run.needs_ceo) await (supabase as any).rpc("replier_escalate", { target: run.id });
  revalidatePath("/app/messages");
  return { error: null, run };
}

export async function markCopiedAction(runId: string, index: number): Promise<{ error: string | null }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (![0, 1, 2].includes(index)) return { error: "Unknown reply." };
  const { error } = await supabase.from("replier_runs").update({ chosen: index, copied_at: new Date().toISOString() }).eq("id", runId);
  return { error: error?.message ?? null };
}

export async function rateRunAction(runId: string, rating: -1 | 1 | null, feedback: string): Promise<{ error: string | null }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase
    .from("replier_runs")
    .update({ rating, feedback: feedback.trim().slice(0, 2000) || null })
    .eq("id", runId);
  return { error: error?.message ?? null };
}

export async function savePlaybookAction(p: Omit<Playbook, "updated_at">): Promise<{ error: string | null }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const row = {
    id: true,
    needs_ceo: p.needs_ceo.slice(0, 6000),
    house_style: p.house_style.slice(0, 6000),
    never_promise: p.never_promise.slice(0, 6000),
    facts: p.facts.slice(0, 12000),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("replier_playbook").upsert(row).select("id");
  if (error) return { error: /row-level security/i.test(error.message) ? "Only the CEO can change the playbook." : error.message };
  if (!data?.length) return { error: "Only the CEO can change the playbook." };
  revalidatePath("/app/messages");
  return { error: null };
}

export async function addExampleAction(clientMessage: string, reply: string, note: string): Promise<{ error: string | null; example?: ReplierExample }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  if (!clientMessage.trim() || !reply.trim()) return { error: "An example needs the client’s message and the reply." };
  const { data, error } = await supabase
    .from("replier_examples")
    .insert({ client_message: clientMessage.trim().slice(0, 4000), reply: reply.trim().slice(0, 4000), note: note.trim().slice(0, 1000) || null, created_by: user.id })
    .select("id, client_message, reply, note, created_at")
    .single();
  if (error) return { error: /row-level security/i.test(error.message) ? "Only the CEO can add examples." : error.message };
  revalidatePath("/app/messages");
  return { error: null, example: data as ReplierExample };
}

export async function deleteExampleAction(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await signedIn();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("replier_examples").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the CEO can remove examples." };
  return { error: null };
}
