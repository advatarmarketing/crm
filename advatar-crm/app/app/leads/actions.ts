"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import type { ClientStage } from "@/lib/supabase/types";

/**
 * Moves a client to another pipeline stage.
 *
 * No role check beyond what RLS already does ("clients: management
 * full access" / "clients: staff update assigned",
 * 0010_ops_manager_leads_staff_scoping.sql) — a staff account can only
 * do this for a client it is actually assigned to.
 *
 * The timeline entry for this is written by a database trigger
 * (0012_documents_fathom_activity.sql) rather than here, so a stage
 * change made from the client detail form — which writes to `clients`
 * straight from the browser — gets recorded too.
 */
export async function advanceClientStage(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const nextStage = String(formData.get("nextStage")) as ClientStage;

  if (!["lead", "proposal", "active"].includes(nextStage)) {
    return;
  }

  const supabase = createClient();
  await supabase.from("clients").update({ stage: nextStage }).eq("id", clientId);

  revalidatePath("/app/leads");
  revalidatePath("/app/clients");
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/dashboard");
}

/**
 * "I just spoke to them."
 *
 * Stamps the contact date and sets the next follow-up in one step,
 * because the two always happen together — the reason follow-ups get
 * missed is that logging the call and scheduling the next one are
 * usually two separate chores.
 */
export async function logContact(formData: FormData) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const clientId = String(formData.get("clientId") ?? "");
  const nextFollowUp = String(formData.get("nextFollowUp") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!clientId) return;

  await supabase
    .from("clients")
    .update({
      last_contacted_at: new Date().toISOString(),
      // Blank clears the reminder rather than leaving a stale date
      // sitting in the overdue pile forever.
      follow_up_date: nextFollowUp || null,
    })
    .eq("id", clientId);

  await logActivity(supabase, {
    clientId,
    kind: "contact_logged",
    summary: note ? `Contacted — ${note}` : "Contacted",
    meta: { nextFollowUp: nextFollowUp || null },
    actorId: user?.id ?? null,
  });

  revalidatePath("/app/leads");
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/dashboard");
}
