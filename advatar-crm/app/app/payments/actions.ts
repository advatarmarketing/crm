"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AddPaymentState {
  error: string | null;
  success: boolean;
}

/**
 * ceo-only, checked twice: once here (so a direct call to this action
 * from anywhere still gets a clear rejection instead of relying on
 * the page never having rendered a form for anyone else), and again
 * by the `payments` RLS policy itself (Phase 3: "payments: ceo full
 * access" is the only policy granting insert at all) — the RLS check
 * is what actually can't be bypassed; this one is just a better error
 * message than a raw Postgres permission failure.
 *
 * `staffId` gets the same two-layer treatment as of Phase 11's
 * verification pass: this action now re-fetches the target profile's
 * `role` and rejects anything outside `staff`/`videographer` with a
 * clean error, on top of `0009_payments_staff_role_check.sql`'s
 * trigger doing the same check at the database level regardless of
 * caller. Before that migration, nothing stopped `staff_id` from
 * being set to a client's profile id — since `payments: read own`
 * (Phase 3) is scoped purely by `staff_id = auth.uid()`, not by role,
 * that client's own account would then have been able to read that
 * row straight back. This form's picker already only ever lists
 * staff/videographer profiles, so this is defense-in-depth against a
 * manipulated request, not a fix to anything reachable through the UI
 * as it exists today.
 */
export async function addPayment(_prev: AddPaymentState, formData: FormData): Promise<AddPaymentState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", success: false };

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (caller?.role !== "ceo") {
    return { error: "Only the CEO can add payments.", success: false };
  }

  const staffId = String(formData.get("staffId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const paidOn = String(formData.get("paidOn") ?? "");

  const amount = Number(amountRaw);
  if (!staffId) return { error: "Choose a staff member.", success: false };
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) return { error: "Enter a valid amount.", success: false };
  if (!paidOn) return { error: "Choose a date.", success: false };

  const { data: target } = await supabase.from("profiles").select("role").eq("id", staffId).maybeSingle();
  if (!target || (target.role !== "staff" && target.role !== "videographer")) {
    return { error: "That person isn't a staff member or videographer.", success: false };
  }

  const { error } = await supabase.from("payments").insert({
    staff_id: staffId,
    amount,
    note: note || null,
    paid_on: paidOn,
    created_by: user.id,
  });

  if (error) return { error: error.message, success: false };

  revalidatePath("/app/payments");
  return { error: null, success: true };
}
