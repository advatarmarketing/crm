import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { aiSettings, costOf, logAiCall } from "@/lib/ai-usage";
import { MEETING_KEY_ENV } from "@/lib/onboarding/meeting";
import { loadClientWork } from "@/lib/client-work";
import { describePackage, packageFromRow } from "@/lib/packages";
import { addDays, todayKey } from "@/lib/videos";
import { CHANNELS, REPLYING_AS, type Channel, type Playbook, type ReplierExample, type ReplierResult, type ReplyingAs } from "@/lib/replier";

/**
 * Professional Replier: one call to Claude with the CEO's playbook, a
 * few replies the CEO marked as good, and what the CRM knows about the
 * client (package, this month, the next videos and when they're
 * planned to be filmed, the recent portal conversation). It returns the
 * best reply, two other good ones, and whether the message needs the
 * CEO before anyone commits to anything.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export const REPLIER_MODEL = "claude-opus-5-5";
export const replierOn = () => Boolean(process.env[MEETING_KEY_ENV]);

const Output = z.object({
  understanding: z.string().describe("One short sentence: what the client is really asking for or feeling."),
  needs_ceo: z.boolean().describe("True if the message touches anything on the needs-the-CEO list, or anything that commits Advatar to something not already agreed."),
  ceo_reason: z.string().nullable().describe("If needs_ceo: in a few words, which decision is the CEO's. Otherwise null."),
  note_to_ceo: z.string().nullable().describe("If needs_ceo: two or three plain sentences for the CEO saying what the client wants and what needs deciding. Otherwise null."),
  replies: z
    .array(
      z.object({
        label: z.string().describe("Two to four words naming the approach, e.g. 'Warm and direct'."),
        text: z.string().describe("The reply, exactly as it would be sent."),
        why: z.string().describe("One short sentence on when this one is the better choice."),
      })
    )
    .describe("Exactly three replies, the best first."),
  check_first: z.array(z.string()).describe("Things the person should check or fill in before sending, e.g. a date in [square brackets]. Empty if none."),
});

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l.replace(/^[-•*]\s*/, "")}`)
    .join("\n");

/** The stable part of the prompt: changes only when the CEO edits the playbook or examples. */
export function systemPrompt(playbook: Playbook, examples: ReplierExample[]): string {
  const ex = examples
    .slice(0, 12)
    .map((e, i) => `<example index="${i + 1}">\n<client_message>${e.client_message}</client_message>\n<good_reply>${e.reply}</good_reply>${e.note ? `\n<why_it_is_good>${e.note}</why_it_is_good>` : ""}\n</example>`)
    .join("\n");
  return `You write replies to clients for Advatar, a UK short-form video agency. Someone on the Advatar team pastes in a message a client sent them, and you give them the best possible reply to copy and send, plus two other good ones.

What a great reply does:
- It answers what the client actually asked, in the first line, and reassures them where they sound unsure or worried.
- It sounds like a real, capable person at a premium agency: warm, confident, specific, and short enough for the channel.
- It moves things forward with one clear next step, and never leaves the client wondering what happens next.
- It only states facts that are in the CRM information or the playbook below. If a fact the reply needs is not there (a date, a price, a name), the reply either says the team will confirm it, or leaves a short placeholder in [square brackets] that is listed under check_first. Never invent dates, prices, numbers, results or promises.
- Planned dates in the CRM information are Advatar's internal plan. Use them to give a sensible answer ("we're planning to film the week of 8 December"), but don't present one as confirmed unless it says it is.

Processes come first. Many messages can't just be answered with "sure, I'll get that done": they need the CEO to decide first. If the message touches anything on the needs-the-CEO list, or would commit Advatar to anything that isn't already agreed, set needs_ceo to true. Then every reply must be a holding reply: thank them, show the request has been heard and is being taken seriously, and say when they'll hear back (for example "today" or "shortly"), without agreeing to, refusing, pricing or promising anything. Write note_to_ceo so the CEO can decide in seconds. When in doubt, set needs_ceo to true: a short wait is better than a promise the business has to break.

The three replies should be genuinely different choices (for example: warm and direct, more detailed, shortest), not the same reply reworded. Put the one you'd send first. Write each reply exactly as it would be sent: no subject line unless the channel is email, no notes inside it, no "Hi [name]" if the name is known.

<needs_the_ceo>
${lines(playbook.needs_ceo) || "- Anything about contracts, prices, renewals, refunds, complaints or cancelling"}
</needs_the_ceo>

<house_style>
${lines(playbook.house_style) || "- British English. Warm, confident, short."}
</house_style>

<never_promise>
${lines(playbook.never_promise) || "- Any date, price or result that isn't confirmed"}
</never_promise>

<facts_about_advatar>
${playbook.facts.trim() || "Advatar makes short-form video content: planning, filming, editing and posting."}
</facts_about_advatar>
${ex ? `\nReplies the CEO marked as good, to match in tone and judgement (not to copy word for word):\n<examples>\n${ex}\n</examples>` : ""}`;
}

const CHANNEL_NOTE: Record<Channel, string> = {
  whatsapp: "WhatsApp: short, conversational, line breaks rather than paragraphs, at most one emoji.",
  instagram: "Instagram DM: short and friendly, like WhatsApp.",
  email: "Email: a greeting, a short body and a sign-off with the sender's first name. Still concise.",
  text: "Text message: very short, no emoji.",
};

/** What the CRM knows that helps answer: who the client is, their package, this month, what's coming up. */
export async function clientContext(supabase: Db, clientId: string | null): Promise<{ name: string | null; text: string }> {
  if (!clientId) return { name: null, text: "No client chosen: the person may be a new enquiry. Don't assume anything about them." };
  const today = todayKey();
  const [client, pkg, cycle, thread] = await Promise.all([
    supabase.from("clients").select("id, name, stage, service, internal_kind, posting_started_on").eq("id", clientId).maybeSingle(),
    supabase.from("client_packages").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("content_cycles").select("number, starts_on, ends_on").eq("client_id", clientId).lte("starts_on", addDays(today, 31)).gte("ends_on", today).order("starts_on").limit(2),
    supabase.from("message_threads").select("id").eq("client_id", clientId).maybeSingle(),
  ]);
  const c = client.data as { name: string | null; stage: string | null; service: string | null; posting_started_on: string | null } | null;
  if (!c) return { name: null, text: "The chosen client couldn't be found." };
  const out: string[] = [`Client: ${c.name ?? "Unnamed"}`];
  if (c.stage) out.push(`Stage: ${c.stage}`);
  if (c.service) out.push(`Service: ${c.service}`);
  if (pkg.data) {
    try {
      out.push(`Package: ${describePackage(packageFromRow(pkg.data))}`);
    } catch {
      // A package that doesn't parse is left out rather than guessed.
    }
  }
  if (c.posting_started_on) out.push(`Posting with Advatar since: ${c.posting_started_on}`);
  for (const cy of (cycle.data ?? []) as { number: number; starts_on: string; ends_on: string }[]) out.push(`Month ${cy.number}: ${cy.starts_on} to ${cy.ends_on}`);

  try {
    const work = await loadClientWork(supabase, clientId, today);
    const vids = work.videos.slice(0, 10).map((v) => {
      const step = (k: "film" | "edit" | "post") => `${k} ${v.steps[k]?.done ? "done" : `planned by ${v.steps[k]?.due ?? "?"}`}`;
      return `- ${v.label}, going out ${v.publish}${v.pillar ? ` (${v.pillar})` : ""}: ${step("film")}, ${step("edit")}, ${step("post")}`;
    });
    if (vids.length) out.push(`Upcoming videos (Advatar's internal plan, not confirmed with the client):\n${vids.join("\n")}`);
    else out.push("No upcoming videos are planned in the CRM yet.");
  } catch {
    // Work view unavailable before 0053.
  }

  const threadId = (thread.data as { id: string } | null)?.id;
  if (threadId) {
    const { data: msgs } = await supabase.from("messages").select("body, sender_role, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(10);
    const recent = ((msgs ?? []) as { body: string; sender_role: string | null; created_at: string }[])
      .reverse()
      .map((m) => `- ${m.created_at.slice(0, 10)} ${m.sender_role === "client" ? "Client" : "Advatar"}: ${m.body.replace(/\s+/g, " ").slice(0, 300)}`);
    if (recent.length) out.push(`Recent messages in the client portal chat (oldest first):\n${recent.join("\n")}`);
  }
  return { name: c.name, text: out.join("\n") };
}

export async function writeReplies(input: {
  playbook: Playbook;
  examples: ReplierExample[];
  context: string;
  message: string;
  extra: string | null;
  replyingAs: ReplyingAs;
  senderName: string | null;
  channel: Channel;
  clientId: string | null;
}): Promise<{ ok: true; result: ReplierResult; model: string; costUsd: number } | { ok: false; error: string }> {
  if (!replierOn()) return { ok: false, error: "The Professional Replier needs the ANTHROPIC_API_KEY in Vercel’s settings." };
  const role = REPLYING_AS.find((r) => r.id === input.replyingAs)?.label ?? "Advatar";
  const user = `<crm_information>
Today: ${todayKey()}
${input.context}
</crm_information>

<replying>
From: ${input.senderName ? `${input.senderName}, ` : ""}${role} at Advatar
Channel: ${CHANNEL_NOTE[input.channel]}
</replying>
${input.extra ? `\n<from_the_team>\n${input.extra}\n</from_the_team>\n` : ""}
<client_message>
${input.message}
</client_message>

Write the three replies to this message.`;

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: REPLIER_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(Output) },
      system: [{ type: "text", text: systemPrompt(input.playbook, input.examples), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    const out = response.parsed_output;
    const ok = !!out && response.stop_reason !== "refusal" && response.stop_reason !== "max_tokens";
    await logAiCall({ feature: "replier", model: response.model, usage: response.usage, ok, clientId: input.clientId, error: ok ? null : String(response.stop_reason) });
    if (!ok || !out) return { ok: false, error: "No replies came back that time. Try again, or reword the message slightly." };
    const replies = out.replies
      .map((r) => ({ label: r.label.trim().slice(0, 60) || "Reply", text: r.text.trim(), why: r.why.trim().slice(0, 300) }))
      .filter((r) => r.text)
      .slice(0, 3);
    if (!replies.length) return { ok: false, error: "No replies came back that time. Try again." };
    const s = await aiSettings();
    return {
      ok: true,
      model: response.model,
      costUsd: costOf(s, response.model, response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) * 0.1 + (response.usage.cache_creation_input_tokens ?? 0) * 1.25, response.usage.output_tokens),
      result: {
        understanding: out.understanding.trim(),
        needs_ceo: out.needs_ceo,
        ceo_reason: out.needs_ceo ? out.ceo_reason?.trim() || "Needs your decision" : null,
        note_to_ceo: out.needs_ceo ? out.note_to_ceo?.trim() || null : null,
        replies,
        check_first: out.check_first.map((x) => x.trim()).filter(Boolean).slice(0, 6),
      },
    };
  } catch (error) {
    await logAiCall({ feature: "replier", model: REPLIER_MODEL, usage: null, ok: false, clientId: input.clientId, error: error instanceof Error ? error.message : "failed" });
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "The ANTHROPIC_API_KEY in Vercel was refused. Check it is copied in full and still active." };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Too many requests just now. Wait a minute and try again." };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, error: "Couldn’t reach the service. Try again in a moment." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `It failed (${error.status ?? "error"}). Try again in a moment.` };
    throw error;
  }
}

export { CHANNELS };
