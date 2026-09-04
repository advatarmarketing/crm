import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceForm } from "../InvoiceForm";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: { client?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo" && profile?.role !== "operations_manager") {
    redirect("/app/dashboard");
  }

  const { data: clients } = await supabase.from("clients").select("id, name").order("name");

  return (
    <main className="page-narrow">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, letterSpacing: "0.02em", margin: "0 0 4px" }}>
        New invoice
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)", margin: "0 0 28px" }}>
        Leave it as a draft while you prepare it, then mark it sent once it&apos;s with the client.
      </p>

      <InvoiceForm
        clients={clients ?? []}
        invoice={searchParams?.client ? { client_id: searchParams.client } : undefined}
      />
    </main>
  );
}
