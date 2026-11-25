"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultContent, DEFAULT_MESSAGE, type ProposalContent } from "@/lib/proposals/content";
import { parseContent } from "@/lib/proposals/schema";
import { loadById, onboard, resetClientLogin } from "@/lib/proposals/server";
import { requestOrigin } from "@/lib/proposals/origin";

/**
 * The team's side of proposals (0057). Row level security decides who
 * can do what (can_make_proposals, can_see_deal); these only tidy the
 * input and say what went wrong in plain words.
 */

const NOT_RUN = "Proposals start once database update 0057 has been run in Supabase.";
const notRun = (m?: string) => /proposal|can_see_deal|can_make_proposals|does not exist|could not find/i.test(m ?? "");

async function me() {
  // The generated table types predate 0057.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function tidy(s: unknown, max: number) {
  return String(s ?? "").trim().slice(0, max);
}

export async function createDealAction(input: {
  business: string;
  contact: string;
  email: string;
  clientId: string | null;
  templateId: string | null;
}): Promise<{ error: string | null; proposalId?: string; dealId?: string }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  let business = tidy(input.business, 160);
  const email = tidy(input.email, 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };

  if (input.clientId) {
    const { data: c } = await supabase.from("clients").select("name").eq("id", input.clientId).maybeSingle();
    if (!c) return { error: "Couldn't find that client." };
    business = business || (c as { name: string }).name;
  }
  if (!business) return { error: "Enter the business name." };

  let content: ProposalContent = defaultContent();
  let message: string = DEFAULT_MESSAGE;
  if (input.templateId) {
    const { data: tpl } = await supabase.from("proposal_templates").select("content, message").eq("id", input.templateId).maybeSingle();
    const parsed = tpl ? parseContent((tpl as { content: unknown }).content) : null;
    if (!parsed || !parsed.ok) return { error: "That template couldn't be used." };
    content = parsed.content;
    message = (tpl as { message: string | null }).message || DEFAULT_MESSAGE;
  }

  const { data: deal, error } = await supabase
    .from("proposal_deals")
    .insert({ business_name: business, contact_name: tidy(input.contact, 120) || null, email: email || null, client_id: input.clientId || null, owner_id: user.id })
    .select("id")
    .single();
  if (error || !deal) return { error: notRun(error?.message) ? NOT_RUN : error?.message ?? "Couldn't create the deal." };

  const { data: prop, error: pErr } = await supabase
    .from("proposals")
    .insert({ deal_id: (deal as { id: string }).id, version: 1, content, message, created_by: user.id })
    .select("id")
    .single();
  if (pErr || !prop) return { error: pErr?.message ?? "Couldn't create the proposal." };
  revalidatePath("/app/prospects");
  return { error: null, proposalId: (prop as { id: string }).id, dealId: (deal as { id: string }).id };
}

export async function saveProposalAction(id: string, rawContent: unknown, message: string): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const parsed = parseContent(rawContent);
  if (!parsed.ok) return { error: parsed.error };
  const { data, error } = await supabase
    .from("proposals")
    .update({ content: parsed.content, message: tidy(message, 6000) || null })
    .eq("id", id)
    .select("id, deal_id");
  if (error) return { error: /accepted/i.test(error.message) ? "The client has accepted this version, so it can't be changed. Make a new version instead." : error.message };
  if (!data?.length) return { error: "You can't edit this proposal." };
  revalidatePath(`/app/prospects/deals/${(data[0] as { deal_id: string }).deal_id}`);
  return { error: null };
}

export async function saveDealAction(
  id: string,
  d: { business: string; contact: string; email: string; notes: string; status: "open" | "won" | "lost" }
): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const business = tidy(d.business, 160);
  if (!business) return { error: "The business name can't be empty." };
  const email = tidy(d.email, 200).toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  const { data, error } = await supabase
    .from("proposal_deals")
    .update({
      business_name: business,
      contact_name: tidy(d.contact, 120) || null,
      email: email || null,
      notes: tidy(d.notes, 4000) || null,
      status: ["open", "won", "lost"].includes(d.status) ? d.status : "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't change this deal." };
  revalidatePath(`/app/prospects/deals/${id}`);
  revalidatePath("/app/prospects");
  return { error: null };
}

/**
 * Copying the link or the message counts as sending it. A sent version
 * replaces any older ones that haven't been paid: their links then say
 * "This proposal has been updated" and point here.
 */
export async function markSentAction(id: string): Promise<{ error: string | null; link?: string }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const { data: p } = await supabase.from("proposals").select("id, deal_id, version, status, code").eq("id", id).maybeSingle();
  if (!p) return { error: "You can't see this proposal." };
  const row = p as { id: string; deal_id: string; version: number; status: string; code: string };
  if (row.status === "superseded") return { error: "A newer version has replaced this one." };
  if (row.status === "draft") {
    await supabase.from("proposals").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  }
  await supabase
    .from("proposals")
    .update({ status: "superseded", superseded_by: id })
    .eq("deal_id", row.deal_id)
    .lt("version", row.version)
    .is("paid_at", null)
    .neq("status", "superseded");
  revalidatePath(`/app/prospects/deals/${row.deal_id}`);
  revalidatePath("/app/prospects");
  return { error: null, link: `${requestOrigin()}/proposal/${row.code}` };
}

export async function newVersionAction(id: string): Promise<{ error: string | null; proposalId?: string }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const { data: p } = await supabase.from("proposals").select("deal_id, content, message").eq("id", id).maybeSingle();
  if (!p) return { error: "You can't see this proposal." };
  const src = p as { deal_id: string; content: ProposalContent; message: string | null };
  const { data: top } = await supabase.from("proposals").select("version").eq("deal_id", src.deal_id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = ((top as { version: number } | null)?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("proposals")
    .insert({ deal_id: src.deal_id, version, content: src.content, message: src.message, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't make a new version." };
  await supabase.from("proposal_deals").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", src.deal_id).neq("status", "won");
  revalidatePath(`/app/prospects/deals/${src.deal_id}`);
  return { error: null, proposalId: (data as { id: string }).id };
}

export async function deleteDraftAction(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase.from("proposals").delete().eq("id", id).eq("status", "draft").select("deal_id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only drafts that haven't been sent can be deleted." };
  revalidatePath(`/app/prospects/deals/${(data[0] as { deal_id: string }).deal_id}`);
  return { error: null };
}

// -----------------------------------------------------------------
// Templates (pre-saves)
// -----------------------------------------------------------------

export async function saveTemplateAction(name: string, rawContent: unknown, message: string, replaceId: string | null): Promise<{ error: string | null; id?: string }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const n = tidy(name, 80);
  if (!n) return { error: "Give the template a name." };
  const parsed = parseContent(rawContent);
  if (!parsed.ok) return { error: parsed.error };
  if (replaceId) {
    const { data, error } = await supabase
      .from("proposal_templates")
      .update({ name: n, content: parsed.content, message: tidy(message, 6000) || null, updated_at: new Date().toISOString() })
      .eq("id", replaceId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "You can't change that template." };
    revalidatePath("/app/prospects");
    return { error: null, id: replaceId };
  }
  const { data, error } = await supabase
    .from("proposal_templates")
    .insert({ name: n, content: parsed.content, message: tidy(message, 6000) || null, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: notRun(error?.message) ? NOT_RUN : error?.message ?? "Couldn't save the template." };
  revalidatePath("/app/prospects");
  return { error: null, id: (data as { id: string }).id };
}

export async function renameTemplateAction(id: string, name: string): Promise<{ error: string | null }> {
  const { supabase } = await me();
  const n = tidy(name, 80);
  if (!n) return { error: "Give the template a name." };
  const { data, error } = await supabase.from("proposal_templates").update({ name: n, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't change that template." };
  revalidatePath("/app/prospects");
  return { error: null };
}

export async function deleteTemplateAction(id: string): Promise<{ error: string | null }> {
  const { supabase } = await me();
  const { data, error } = await supabase.from("proposal_templates").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can't delete that template." };
  revalidatePath("/app/prospects");
  return { error: null };
}

// -----------------------------------------------------------------
// After the client accepts
// -----------------------------------------------------------------

export async function cashReceivedAction(id: string, amount: number, note: string): Promise<{ error: string | null; loginProblem?: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.rpc("record_cash_payment", { target: id, paid: amount, note_text: tidy(note, 500) || null });
  if (error) return { error: error.message };
  const p = await loadById(id);
  let loginProblem: string | null = null;
  if (p && !p.deal.clientId) {
    const r = await onboard(id, requestOrigin()).catch((e: unknown) => ({ loginCreated: false, loginProblem: e instanceof Error ? e.message : "Setting the client up failed." }));
    loginProblem = r.loginProblem;
  } else if (p) {
    await onboard(id, requestOrigin()).catch(() => undefined);
  }
  if (p) revalidatePath(`/app/prospects/deals/${p.dealId}`);
  revalidatePath("/app/prospects");
  return { error: null, loginProblem };
}

/** A fresh temporary password for the client's login, to hand over. */
export async function clientLoginDetailsAction(id: string): Promise<{ error: string | null; email?: string; password?: string }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const { data } = await supabase.from("proposals").select("login_profile_id").eq("id", id).maybeSingle();
  const profileId = (data as { login_profile_id: string | null } | null)?.login_profile_id;
  if (!profileId) return { error: "This client doesn't have a login from this proposal yet." };
  const r = await resetClientLogin(profileId);
  if (!r.ok) return { error: r.error };
  return { error: null, email: r.email, password: r.password };
}

/** Re-runs the client set-up, in case something stopped half way. */
export async function finishSetupAction(id: string): Promise<{ error: string | null; loginProblem?: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Not signed in." };
  const { data } = await supabase.from("proposals").select("id, deal_id, paid_at").eq("id", id).maybeSingle();
  if (!data) return { error: "You can't see this proposal." };
  if (!(data as { paid_at: string | null }).paid_at) return { error: "It hasn't been paid yet." };
  const r = await onboard(id, requestOrigin());
  revalidatePath(`/app/prospects/deals/${(data as { deal_id: string }).deal_id}`);
  return { error: null, loginProblem: r.loginProblem };
}
