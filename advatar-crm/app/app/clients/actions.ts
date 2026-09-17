"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientStage, LeadTemperature } from "@/lib/supabase/types";

export interface CreateClientState {
  error: string | null;
}

/**
 * Creates a new `clients` row. RLS ("clients: management full access",
 * most recently rewritten in 0029) only grants insert to
 * ceo/operations_manager — a plain `staff` account's insert would be
 * rejected by Postgres regardless of what this action does, but the
 * explicit role check below gives a clear error message instead of a
 * generic database failure.
 */
export async function createClientRecord(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not signed in." };
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "ceo" && callerProfile?.role !== "operations_manager") {
    return { error: "Only the CEO or an operations manager can add a new client or lead." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Enter a name." };
  }

  const stage = String(formData.get("stage") ?? "lead") as ClientStage;
  if (!["lead", "proposal", "active"].includes(stage)) {
    return { error: "Choose a valid stage." };
  }

  const contactName = String(formData.get("contact_name") ?? "").trim() || null;
  const contactEmail = String(formData.get("contact_email") ?? "").trim() || null;
  const service = String(formData.get("service") ?? "").trim() || null;
  const nextAction = String(formData.get("next_action") ?? "").trim() || null;

  const leadSourceRaw = String(formData.get("lead_source") ?? "").trim();
  const leadSource = leadSourceRaw || null;

  const leadTemperatureRaw = String(formData.get("lead_temperature") ?? "");
  const leadTemperature = (["hot", "warm", "cold"].includes(leadTemperatureRaw)
    ? leadTemperatureRaw
    : null) as LeadTemperature | null;

  const followUpDateRaw = String(formData.get("follow_up_date") ?? "").trim();
  const followUpDate = followUpDateRaw || null;

  // Phase 16: both optional, and both have to survive being left
  // blank — Number("") is 0, which would quietly record a lead as
  // worth nothing rather than as "not estimated yet".
  const estimatedValueRaw = String(formData.get("estimated_value") ?? "").trim();
  const estimatedValue = estimatedValueRaw ? Number(estimatedValueRaw) : null;
  if (estimatedValue !== null && (Number.isNaN(estimatedValue) || estimatedValue < 0)) {
    return { error: "Estimated value must be a positive number." };
  }

  const likelihoodRaw = String(formData.get("likelihood") ?? "").trim();
  const likelihood = likelihoodRaw ? Number(likelihoodRaw) : null;
  if (likelihood !== null && (Number.isNaN(likelihood) || likelihood < 0 || likelihood > 100)) {
    return { error: "Likelihood must be between 0 and 100." };
  }

  // The id is generated here rather than by the database, and the
  // insert deliberately asks for NOTHING back. Both halves of that
  // matter, and the reason is not obvious:
  //
  // An operations manager is scoped to the clients they are assigned
  // to (0029). A brand new client has no assignments yet, so 0024
  // added an AFTER INSERT trigger that puts the creator onto the row
  // the moment it exists. That works — but "insert and return the new
  // row" is a single statement, and Postgres checks the SELECT policy
  // for the returned row BEFORE after-insert triggers run. So the row
  // went in, the assignment had not happened yet, reading it back was
  // refused, and the whole statement was rolled back with "new row
  // violates row-level security policy for table clients". The CEO
  // never saw it, because the CEO is not scoped in the first place.
  //
  // Asking for nothing back removes the read, and knowing the id in
  // advance means we do not need one. By the time anything else looks
  // at this client, the trigger has run and the creator can see it.
  // Reproduced and re-tested against a real Postgres both ways.
  const id = crypto.randomUUID();

  const { error } = await supabase
    .from("clients")
    .insert({
      id,
      name,
      stage,
      contact_name: contactName,
      contact_email: contactEmail,
      service,
      next_action: nextAction,
      lead_source: leadSource,
      lead_temperature: leadTemperature,
      follow_up_date: followUpDate,
      estimated_value: estimatedValue,
      likelihood,
    });

  if (error) {
    return { error: error.message };
  }

  redirect(stage === "lead" ? "/app/leads" : `/app/clients/${id}`);
}
