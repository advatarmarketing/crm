import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddPaymentForm } from "./add-payment-form";

// ceo-only. Like /app/settings/team, middleware.ts alone isn't
// enough to gate this — staff also share the "/app" catch-all prefix
// there — so this page explicitly checks role==='ceo' and bounces
// anyone else. Without this check the page would still be *safe*
// (payments RLS only lets a non-ceo session see their own rows,
// Phase 3), but a staff member landing on a page titled "Payments"
// that quietly only shows their own row, with no error and no
// explanation, would be a confusing bug to live with — this makes
// the boundary an explicit redirect instead.
export default async function PaymentsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "ceo") {
    redirect("/app/my-payments");
  }

  const [{ data: payments }, { data: staff }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, note, paid_on, profiles!staff_id(full_name)")
      .order("paid_on", { ascending: false }),
    supabase.from("profiles").select("id, full_name, role").in("role", ["staff", "videographer"]).order("full_name"),
  ]);

  type PaymentRow = { id: string; amount: number; note: string | null; paid_on: string; profiles: { full_name: string | null } | null };
  const rows = (payments ?? []) as unknown as PaymentRow[];

  return (
    <main style={{ padding: "40px 32px", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
        Payments
      </h1>

      <AddPaymentForm staff={(staff ?? []).map((s) => ({ id: s.id, fullName: s.full_name, role: s.role }))} />

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>No payments recorded yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <Th>Staff</Th>
                <Th>Amount</Th>
                <Th>Note</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <Td>{row.profiles?.full_name ?? "Unknown"}</Td>
                  <Td mono>£{Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Td>
                  <Td>{row.note ?? "—"}</Td>
                  <Td mono>{row.paid_on}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-3)",
        fontWeight: 400,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <td style={{ padding: "10px 12px", fontFamily: mono ? "var(--font-mono)" : "var(--font-body)", color: "var(--text-1)" }}>
      {children}
    </td>
  );
}
