"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClientStage } from "@/lib/supabase/types";

/**
 * Moves a lead to the next pipeline stage. No role check here beyond
 * what RLS already does (clients: management full access /
 * "clients: staff update assigned", 0010) — a staff account can only
 * do this for a client it's actually assigned to, everyone else who
 * can reach this page can do it for anything.
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
}
