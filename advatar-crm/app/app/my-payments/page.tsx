import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// staff + videographer (and, if a ceo happens to visit it, ceo too —
// see the .eq("staff_id", user.id) below for why that stays correct
// even though ceo's RLS would otherwise let this query see everyone).
export default async function MyPaymentsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Explicit filter, not just reliance on RLS: `payments` RLS gives
  // ceo full access to every row, so without this .eq(), a ceo
  // session landing on "My Payments" would see everyone's payments,
  // not their own — breaking what this page's name promises. For
  // staff/videographer, RLS's "payments: read own" policy would
  // already narrow this to the same result on its own; this filter
  // just makes the page's own guarantee independent of which role is
  // viewing it.
  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, note, paid_on")
    .eq("staff_id", user.id)
    .order("paid_on", { ascending: false });

  const rows = payments ?? [];
  const currentYear = new Date().getFullYear();
  const yearTotal = rows
    .filter((p) => new Date(p.paid_on).getFullYear() === currentYear)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <main className="page page-sm">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 8px" }}>
        My Payments
      </h1>

      <div
        style={{
          display: "inline-block",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "16px 22px",
          marginBottom: 28,
        }}
      >
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-3)",
            marginBottom: 6,
          }}
        >
          {currentYear} total
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 30, color: "var(--text-1)" }}>
          £{yearTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>No payments yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
              }}
            >
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>{p.paid_on}</div>
                {p.note && (
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-2)" }}>{p.note}</div>
                )}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, color: "var(--text-1)" }}>
                £{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
