"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClientStage, LeadTemperature } from "@/lib/supabase/types";

export interface CreateClientState {
  error: string | null;
}

/**
 * Creates a new `clients` row. RLS ("clients: management full access",
 * 0010_ops_manager_leads_staff_scoping.sql) only grants insert to
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

  const { data: inserted, error } = await supabase
    .from("clients")
    .insert({
      name,
      stage,
      contact_name: contactName,
      contact_email: contactEmail,
      service,
      next_action: nextAction,
      lead_source: leadSource,
      lead_temperature: leadTemperature,
      follow_up_date: followUpDate,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: error?.message ?? "Could not create the client." };
  }

  redirect(stage === "lead" ? "/app/leads" : `/app/clients/${inserted.id}`);
}
