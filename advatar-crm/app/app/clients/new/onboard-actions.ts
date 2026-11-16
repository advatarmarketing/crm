"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { normalizePackage, describePackage, type PackageSettings } from "@/lib/packages";
import { cycleDates, defaultCycleEnd, packageCount, pillarSequence, todayKey } from "@/lib/videos";
import { planFromMeeting, readMeeting, type MeetingRead } from "@/lib/onboarding/meeting";
import { planGaps, type Gap } from "@/lib/onboarding/gaps";
import type { PlannerContent } from "@/lib/planner/content";

/**
 * Adding a client from a meeting: the package is chosen first, then
 * the meeting is read, the team checks the result, and only then is
 * anything saved. Everything runs as the signed-in person, so the
 * same row level security as the rest of the app decides what they
 * may create (the CEO, or an operations manager).
 */

async function manager() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Not signed in." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "ceo" && role !== "operations_manager") {
    return { supabase, user: null, error: "Only the CEO or an operations manager can add a client." };
  }
  return { supabase, user, error: null };
}

export interface MeetingDraft {
  businessName: string;
  contactName: string;
  contactEmail: string;
  service: string;
  plan: PlannerContent;
  ideas: MeetingRead["video_ideas"];
  toAsk: string[];
  /** What the meeting filled in, for the review screen. */
  filled: string[];
  /** What it did not, so the team knows what is on them. */
  gaps: Gap[];
  meetingTitle: string;
  meetingText: string;
}

export type ReadMeetingState = { error: string | null; draft: MeetingDraft | null };

const MAX_TEXT = 300_000;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function describeFilled(plan: PlannerContent, ideas: number): string[] {
  const out: string[] = [];
  const brand = plan.branding.rows.filter((r) => r.value.trim()).map((r) => r.label.replace(/\s*\(.*\)$/, ""));
  if (brand.length) out.push(`Branding: ${brand.join(", ")}`);
  const pillars = plan.pillars.items.filter((p) => p.name.trim());
  if (pillars.length) out.push(`${pillars.length} content pillar${pillars.length === 1 ? "" : "s"}: ${pillars.map((p) => p.name).join(", ")}`);
  if (plan.thesis.quote.trim() || plan.overview.desc.trim()) out.push("What the account is for");
  const metrics = plan.metrics.items.filter((m) => m.label.trim()).length;
  if (metrics) out.push(`${metrics} metric${metrics === 1 ? "" : "s"} to track`);
  const competitors = plan.competitors.links.filter((l) => l.title.trim()).length;
  if (competitors) out.push(`${competitors} competitor${competitors === 1 ? "" : "s"}`);
  const timeline = plan.timeline.items.filter((t) => t.title.trim()).length;
  if (timeline) out.push(`${timeline} timeline step${timeline === 1 ? "" : "s"}`);
  if (ideas) out.push(`${ideas} video idea${ideas === 1 ? "" : "s"}, placed on the first posting days`);
  return out;
}

export async function readMeetingAction(_prev: ReadMeetingState, formData: FormData): Promise<ReadMeetingState> {
  const { error } = await manager();
  if (error) return { error, draft: null };

  const name = String(formData.get("name") ?? "").trim();
  const text = String(formData.get("notes") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");
  let pkg: PackageSettings | null = null;
  try {
    const parsed = normalizePackage(JSON.parse(String(formData.get("package") ?? "null")) ?? {});
    pkg = parsed.ok ? parsed.value : null;
  } catch {
    pkg = null;
  }

  // "Add without reading a meeting": a blank plan, and every part of
  // it on the list for the team.
  if (formData.get("skip")) {
    const plan = planFromMeeting(null, pkg, name);
    return {
      error: null,
      draft: {
        businessName: name,
        contactName: "",
        contactEmail: "",
        service: "",
        plan,
        ideas: [],
        toAsk: [],
        filled: [],
        gaps: planGaps(plan),
        meetingTitle: title,
        meetingText: text,
      },
    };
  }

  let pdf: string | undefined;
  let fileText = "";
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PDF_BYTES) return { error: "That file is over 4 MB. Paste the meeting summary instead.", draft: null };
    const lower = file.name.toLowerCase();
    if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
      pdf = Buffer.from(await file.arrayBuffer()).toString("base64");
    } else if (/\.(txt|md|markdown|vtt|srt|csv)$/.test(lower) || file.type.startsWith("text/")) {
      fileText = await file.text();
    } else {
      return { error: "Upload a PDF or a text file. For a Word document, save it as PDF or paste the text.", draft: null };
    }
  }

  const notes = [text, fileText].filter(Boolean).join("\n\n");
  if (!notes && !pdf) return { error: "Paste the meeting notes or upload the document.", draft: null };
  if (notes.length > MAX_TEXT) return { error: "That is too long to read in one go. Paste the meeting summary rather than the full transcript.", draft: null };

  const result = await readMeeting({ text: notes, pdf, packageSummary: pkg ? describePackage(pkg) : undefined });
  if (!result.ok) return { error: result.error, draft: null };
  const read = result.read;

  const businessName = name || read.client.business_name?.trim() || "";
  const plan = planFromMeeting(read, pkg, businessName);
  const ideas = read.video_ideas.filter((v) => v.title.trim()).slice(0, 40);

  return {
    error: null,
    draft: {
      businessName,
      contactName: read.client.contact_name?.trim() ?? "",
      contactEmail: read.client.contact_email?.trim() ?? "",
      service: read.client.service?.trim() ?? "",
      plan,
      ideas,
      toAsk: read.to_ask.map((q) => q.trim()).filter(Boolean).slice(0, 12),
      filled: describeFilled(plan, ideas.length),
      gaps: planGaps(plan),
      meetingTitle: title || (pdf && file instanceof File ? file.name : "Onboarding meeting"),
      meetingText: notes || (file instanceof File ? `(PDF: ${file.name})` : ""),
    },
  };
}

export interface CreateOnboardedInput {
  name: string;
  stage: "proposal" | "active";
  contactName: string;
  contactEmail: string;
  service: string;
  pkg: PackageSettings | null;
  presetId: string | null;
  plan: PlannerContent | null;
  ideas: MeetingRead["video_ideas"];
  toAsk: string[];
  meetingTitle: string;
  meetingText: string;
}

/**
 * Saves the client, their package, their plan (as a draft the client
 * cannot see until it is published), the meeting itself, and the
 * first month of videos. Only the client row has to succeed;
 * each other part is reported if it fails rather than undoing the
 * client, because a client with a missing plan is easy to finish and
 * a lost one is not.
 */
export async function createOnboardedClientAction(input: CreateOnboardedInput): Promise<{ error: string | null }> {
  const { supabase, user, error } = await manager();
  if (!user) return { error };

  const name = input.name.trim();
  if (!name) return { error: "Enter the client's name." };
  if (!["proposal", "active"].includes(input.stage)) return { error: "Choose a stage." };
  const email = input.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That contact email doesn't look right." };

  let pkg: PackageSettings | null = null;
  if (input.pkg) {
    const parsed = normalizePackage(input.pkg);
    if (!parsed.ok) return { error: parsed.error };
    pkg = parsed.value;
  }

  // Same reason as createClientRecord: generate the id here and ask
  // for nothing back, so an operations manager's insert is not
  // refused before the trigger assigns them to the new client.
  const id = crypto.randomUUID();
  const { error: insertError } = await supabase.from("clients").insert({
    id,
    name,
    stage: input.stage,
    contact_name: input.contactName.trim() || null,
    contact_email: email || null,
    service: input.service.trim() || null,
    next_action: "Fill in what the meeting didn't cover, then publish the content plan.",
  } as never);
  if (insertError) return { error: insertError.message };

  const problems: string[] = [];

  if (pkg) {
    const { error: e } = await supabase
      .from("client_packages")
      .upsert({ client_id: id, preset_id: input.presetId, ...pkg, updated_by: user.id } as never, { onConflict: "client_id" });
    if (e) problems.push("package");
    else
      await logActivity(supabase, { clientId: id, kind: "package_changed", summary: `Package set: ${describePackage(pkg)}`, actorId: user.id });
  }

  if (input.plan && typeof input.plan === "object") {
    const { error: e } = await supabase
      .from("planners")
      .insert({ client_id: id, content: input.plan as never, status: "draft" } as never);
    if (e) problems.push("content plan");
  }

  if (input.meetingText.trim()) {
    const summary = [
      input.toAsk.length ? `Still to ask:\n${input.toAsk.map((q) => `- ${q}`).join("\n")}` : null,
      input.meetingText.trim(),
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 300_000);
    const { error: e } = await supabase.from("fathom_calls").insert({
      fathom_call_id: `manual:${crypto.randomUUID()}`,
      client_id: id,
      source: "manual",
      title: input.meetingTitle.trim() || "Onboarding meeting",
      summary,
      received_at: new Date().toISOString(),
      applied: true,
      reviewed_at: new Date().toISOString(),
      created_by: user.id,
    } as never);
    if (e) problems.push("meeting notes");
    else await logActivity(supabase, { clientId: id, kind: "meeting_linked", summary: `Client added from: ${input.meetingTitle || "onboarding meeting"}`, actorId: user.id });
  }

  // Month 1: starts today, runs a month, and holds the videos the
  // package gives in that time, with the meeting's ideas on the first
  // ones and pillars from the plan on the rest.
  if (pkg) {
    const from = todayKey();
    const to = defaultCycleEnd(from);
    const adds = cycleDates(pkg, from, to, packageCount(pkg, from, to));
    // Allowed to fail: before 0045 there are no months, and the videos
    // still go on the schedule without one.
    const { data: cycle } = await supabase
      .from("content_cycles")
      .insert({ client_id: id, number: 1, starts_on: from, ends_on: to, created_by: user.id, updated_by: user.id } as never)
      .select("id")
      .maybeSingle();
    const cycleId = (cycle as { id: string } | null)?.id ?? null;
    if (adds.length) {
      const pillars = pillarSequence(
        (input.plan?.pillars?.items ?? []).map((p) => ({ name: String(p.name ?? ""), pct: Number(p.pct ?? 0) })),
        adds.length
      );
      const ideas = (input.ideas ?? []).filter((v) => v.title?.trim());
      const rows = adds.map((a, i) => {
        const idea = ideas[i];
        return {
          client_id: id,
          publish_on: a.date,
          day_order: a.day_order,
          title: idea?.title.trim() || null,
          pillar: idea?.pillar?.trim() || pillars[i],
          description: idea?.description?.trim() || null,
          hook: idea?.hook?.trim() || null,
          cta: idea?.cta?.trim() || null,
          ...(cycleId ? { cycle_id: cycleId, position: i + 1 } : {}),
          created_by: user.id,
          updated_by: user.id,
        };
      });
      const { error: e } = await supabase.from("content_videos").insert(rows as never);
      if (e) problems.push("video schedule");
      else
        await logActivity(supabase, {
          clientId: id,
          kind: "videos_scheduled",
          summary: `Month 1 started with ${rows.length} video${rows.length === 1 ? "" : "s"}`,
          actorId: user.id,
        });
    }
  }

  const note = problems.length ? `&missing=${encodeURIComponent(problems.join(","))}` : "";
  redirect(`/app/clients/${id}?tab=info&added=1${note}`);
}
