import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "../InvoiceForm";
import { deleteInvoice } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const [{ data: invoice }, { data: clients }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, client_id, number, service, amount, invoice_date, due_date, status")
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  // Missing here means either it doesn't exist or RLS filtered it out
  // — both should look the same rather than leaking which.
  if (!invoice) notFound();

  return (
    <main className="page-narrow">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, letterSpacing: "0.02em", margin: "0 0 28px" }}>
        Edit invoice
      </h1>

      <InvoiceForm clients={clients ?? []} invoice={invoice} />

      <form action={deleteInvoice} style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
        <input type="hidden" name="invoiceId" value={invoice.id} />
        <button
          type="submit"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            background: "none",
            border: "none",
            color: "var(--status-closed)",
            cursor: "pointer",
            padding: "8px 0",
            minHeight: 44,
          }}
        >
          Delete this invoice
        </button>
      </form>
    </main>
  );
}
