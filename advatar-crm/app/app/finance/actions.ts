"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { formatMoney } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/supabase/types";

export interface InvoiceFormState {
  error: string | null;
}

/**
 * Finance is CEO + operations manager, matching
 * 0011_invoices_finance.sql's "invoices: management full access"
 * policy. Every action below re-checks the caller's role rather than
 * trusting that the page only rendered a form for the right people —
 * a server action is reachable directly, so the page never being
 * shown is not a permission check. RLS is still the real boundary;
 * this just turns a raw Postgres permission failure into a sentence
 * someone can act on.
 */
async function requireFinanceAccess() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, error: "Not signed in." as string | null };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    return { supabase, user, error: "Only the CEO or an operations manager can manage invoices." };
  }

  return { supabase, user, error: null };
}

export async function saveInvoice(
  _prev: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const { supabase, error: accessError } = await requireFinanceAccess();
  if (accessError) return { error: accessError };

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const number = String(formData.get("number") ?? "").trim();
  const service = String(formData.get("service") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const invoiceDate = String(formData.get("invoiceDate") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  const status = String(formData.get("status") ?? "draft") as InvoiceStatus;

  if (!clientId) return { error: "Choose a client." };
  if (!["draft", "sent", "paid"].includes(status)) return { error: "Choose a valid status." };

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter an amount greater than zero." };
  }

  // A due date before the invoice date is almost always a typo, and
  // silently accepting it would put the invoice straight into the
  // overdue pile for reasons nobody could see.
  if (invoiceDate && dueDate && dueDate < invoiceDate) {
    return { error: "The due date can't be before the invoice date." };
  }

  const fields = {
    client_id: clientId,
    number: number || null,
    service: service || null,
    amount,
    invoice_date: invoiceDate || null,
    due_date: dueDate || null,
    status,
    // Marking something paid from the form (rather than the one-click
    // action) still needs to stamp when — and clearing it back to
    // unpaid has to clear that stamp, or "paid this month" totals keep
    // counting an invoice that is no longer paid.
    paid_at: status === "paid" ? new Date().toISOString() : null,
  };

  if (invoiceId) {
    // Keep the original paid_at if it was already paid and still is,
    // so editing an unrelated field doesn't silently re-date the
    // payment into the current month.
    const { data: existing } = await supabase
      .from("invoices")
      .select("status, paid_at")
      .eq("id", invoiceId)
      .maybeSingle();

    if (existing?.status === "paid" && status === "paid" && existing.paid_at) {
      fields.paid_at = existing.paid_at;
    }

    const { error } = await supabase.from("invoices").update(fields).eq("id", invoiceId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("invoices").insert(fields);
    if (error) return { error: error.message };
  }

  revalidatePath("/app/finance");
  revalidatePath(`/app/clients/${clientId}`);
  redirect("/app/finance");
}

export async function markInvoicePaid(formData: FormData) {
  const { supabase, user, error } = await requireFinanceAccess();
  if (error) return;

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("client_id, amount, number")
    .eq("id", invoiceId)
    .maybeSingle();

  await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId);

  if (invoice?.client_id) {
    await logActivity(supabase, {
      clientId: invoice.client_id,
      kind: "invoice_paid",
      summary: `Invoice${invoice.number ? ` #${invoice.number}` : ""} paid — ${formatMoney(invoice.amount)}`,
      meta: { invoiceId },
      actorId: user?.id ?? null,
    });
    revalidatePath(`/app/clients/${invoice.client_id}`);
  }

  revalidatePath("/app/finance");
  revalidatePath("/app/dashboard");
}

export async function markInvoiceSent(formData: FormData) {
  const { supabase, user, error } = await requireFinanceAccess();
  if (error) return;

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("client_id, amount, number")
    .eq("id", invoiceId)
    .maybeSingle();

  await supabase.from("invoices").update({ status: "sent", paid_at: null }).eq("id", invoiceId);

  if (invoice?.client_id) {
    await logActivity(supabase, {
      clientId: invoice.client_id,
      kind: "invoice_sent",
      summary: `Invoice${invoice.number ? ` #${invoice.number}` : ""} sent — ${formatMoney(invoice.amount)}`,
      meta: { invoiceId },
      actorId: user?.id ?? null,
    });
    revalidatePath(`/app/clients/${invoice.client_id}`);
  }

  revalidatePath("/app/finance");
  revalidatePath("/app/dashboard");
}

export async function deleteInvoice(formData: FormData) {
  const { supabase, error } = await requireFinanceAccess();
  if (error) return;

  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) return;

  await supabase.from("invoices").delete().eq("id", invoiceId);

  revalidatePath("/app/finance");
  redirect("/app/finance");
}
