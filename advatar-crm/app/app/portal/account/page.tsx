import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadClientAccount, money } from "@/lib/account";
import { prettyDay } from "@/lib/videos";

export const dynamic = "force-dynamic";

/**
 * The client's Account page: are they up to date, what is next, what
 * has been paid, and anything the team needs to tell them about it.
 *
 * Read-only. Payments are ticked off by the team when they arrive; the
 * client's side is to see where they stand without having to ask.
 */
export default async function PortalAccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).maybeSingle();
  const clientId = (profile as { client_id?: string | null } | null)?.client_id ?? null;
  if (!clientId) return null; // see PortalLayout

  const account = await loadClientAccount(supabase, clientId);
  const nothingYet = !account.next && account.paid.length === 0 && account.overdue.length === 0 && !account.note;

  return (
    <main className="page page-sm">
      <h1 className="page-title page-title-accent">Account</h1>
      <p style={{ fontSize: 14, color: "var(--text-2)", margin: "0 0 26px", maxWidth: "60ch", lineHeight: 1.6 }}>
        Where your payments stand. Your team marks each one as received.
      </p>

      {nothingYet ? (
        <div className="card card-pad" style={{ color: "var(--text-2)" }}>
          Nothing to show yet. Once your first invoice is sent, it will appear here with its due date.
        </div>
      ) : (
        <>
          <section
            className="card card-pad"
            style={{
              marginBottom: 22,
              borderLeft: `4px solid ${account.upToDate ? "var(--ok-fg)" : "var(--danger-fg)"}`,
            }}
          >
            <p style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 6px" }}>
              {account.upToDate ? "✓ You’re up to date" : "A payment is overdue"}
            </p>
            {account.overdue.map((i) => (
              <p key={i.id} style={{ margin: "4px 0 0", fontSize: 14.5 }}>
                {i.number ? `Invoice ${i.number}` : "Invoice"} — {money(i.amount)}, due {i.due_date ? prettyDay(i.due_date) : "now"}
              </p>
            ))}
            {account.next && (
              <p style={{ margin: "10px 0 0", fontSize: 14.5, color: "var(--text-2)" }}>
                Next: <strong style={{ color: "var(--text-1)" }}>{account.next.label}</strong>
                {account.next.amount !== null ? ` · ${money(account.next.amount)}` : ""} · due {prettyDay(account.next.date)}
              </p>
            )}
          </section>

          {account.note && (
            <section className="card card-pad" style={{ marginBottom: 22, background: "var(--accent-soft)", borderColor: "var(--accent-ring)" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", margin: "0 0 8px" }}>
                From your team{account.noteUpdatedAt ? ` · ${new Date(account.noteUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
              </p>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{account.note}</p>
            </section>
          )}

          {(account.billingAmount !== null || account.paymentDay) && (
            <section className="section">
              <h2 className="section-title" style={{ fontSize: 18 }}>Your plan</h2>
              <p style={{ fontSize: 14.5, margin: 0 }}>
                {account.billingAmount !== null ? money(account.billingAmount) : ""}
                {account.billingFrequency ? ` ${account.billingFrequency.replace("_", " ")}` : ""}
                {account.paymentDay ? ` · paid on the ${ordinal(account.paymentDay)} of each month` : ""}
              </p>
            </section>
          )}

          {account.paid.length > 0 && (
            <section className="section">
              <h2 className="section-title" style={{ fontSize: 18 }}>Paid</h2>
              <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {account.paid.map((i, n) => (
                  <li
                    key={i.id}
                    style={{ display: "flex", gap: 12, justifyContent: "space-between", padding: "11px 16px", borderTop: n ? "1px solid var(--border)" : "none", fontSize: 14 }}
                  >
                    <span>
                      {i.number ? `Invoice ${i.number}` : "Invoice"}
                      {i.service ? <span style={{ color: "var(--text-3)" }}> · {i.service}</span> : null}
                    </span>
                    <span style={{ whiteSpace: "nowrap" }}>
                      {money(i.amount)} <span className="pill pill-ok">Received</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
