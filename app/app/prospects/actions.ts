"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks a fathom_calls row reviewed and sends the staff member
 * straight to the client it created, on the 90-Day Plan tab, so they
 * can confirm/edit before it's ever published. Runs as the signed-in
 * user (not the admin client) — fathom_calls RLS is ceo/staff full
 * access (Phase 3), so this update simply fails under RLS for anyone
 * else, same as every other write in this app.
 */
export async function reviewAndOpen(formData: FormData) {
  const callId = String(formData.get("callId"));
  const clientId = String(formData.get("clientId"));

  const supabase = createClient();
  await supabase.from("fathom_calls").update({ reviewed_at: new Date().toISOString() }).eq("id", callId);

  redirect(`/app/clients/${clientId}?tab=plan`);
}
