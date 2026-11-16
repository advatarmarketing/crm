"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

/**
 * The client-facing account details (0043): which day of the month
 * they pay, and a note the client reads on their Account page.
 * Management only — RLS refuses anyone else.
 */
export async function saveClientAccountAction(
  clientId: string,
  paymentDay: number | null,
  note: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (paymentDay !== null && (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 28)) {
    return { error: "Payment day must be between 1 and 28, so it exists in every month." };
  }
  const text = note.trim().slice(0, 1000);

  const { data: before } = await supabase.from("client_accounts").select("note").eq("client_id", clientId).maybeSingle();
  const noteChanged = ((before as { note?: string | null } | null)?.note ?? "") !== text;

  const row: Record<string, unknown> = {
    client_id: clientId,
    payment_day: paymentDay,
    note: text || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (noteChanged) row.note_updated_at = text ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("client_accounts")
    .upsert(row as never, { onConflict: "client_id" })
    .select("client_id");

  if (error) {
    if (/client_accounts/.test(error.message) && /does not exist|could not find/i.test(error.message)) {
      return { error: "This isn’t switched on yet — database update 0043 still needs running." };
    }
    if (/row-level security/i.test(error.message)) return { error: "Only management can change this." };
    return { error: error.message };
  }
  if (!data || (data as unknown[]).length === 0) return { error: "Only management can change this." };

  if (noteChanged && text) {
    await logActivity(supabase, { clientId, kind: "account_note", summary: "Account note for the client updated", actorId: user.id });
  }
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/portal/account");
  return { error: null };
}
