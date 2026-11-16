import { STRIPE_KEY_ENV, loadStripeOverview, stripeMoney } from "@/lib/stripe";

/**
 * Stripe at a glance on the Finance page, CEO only: the balance, what
 * has come in lately, and the next payouts. Read-only.
 */
export async function StripePanel() {
  const s = await loadStripeOverview();
  const mono = { fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: "var(--text-3)" };

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Stripe</h2>
        <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="section-sub">
          Open Stripe ↗
        </a>
      </div>

      {s.state === "no-key" && (
        <div className="card card-pad" style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-2)" }}>
          <p style={{ margin: "0 0 8px", color: "var(--text-1)" }}>Connect Stripe to see payments here (read-only).</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>In Stripe: Developers → API keys → <strong>Create restricted key</strong>.</li>
            <li>Give it <strong>Read</strong> on Balance, Charges and Payouts. Leave everything else as None.</li>
            <li>
              In Vercel: Settings → Environment Variables → add <code>{STRIPE_KEY_ENV}</code> with that key, then redeploy.
            </li>
          </ol>
        </div>
      )}

      {s.state === "secret-key" && (
        <p className="card card-pad" style={{ color: "var(--danger-fg)", fontSize: 14, margin: 0 }}>
          {STRIPE_KEY_ENV} holds a full secret key (sk_…), which can move money. Replace it with a restricted key
          (rk_…) that can only read.
        </p>
      )}

      {s.state === "error" && (
        <p className="card card-pad" style={{ color: "var(--danger-fg)", fontSize: 14, margin: 0 }}>
          Stripe couldn’t be read: {s.message}
        </p>
      )}

      {s.state === "ok" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="stat-row" style={{ margin: 0 }}>
            {(s.available ?? []).map((b) => (
              <div key={`a-${b.currency}`} className="card card-pad-sm">
                <div style={mono}>Available</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{stripeMoney(b.amount, b.currency)}</div>
              </div>
            ))}
            {(s.pending ?? []).map((b) => (
              <div key={`p-${b.currency}`} className="card card-pad-sm">
                <div style={mono}>On the way</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>{stripeMoney(b.amount, b.currency)}</div>
              </div>
            ))}
          </div>

          {(s.charges ?? []).length > 0 && (
            <ul className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {s.charges!.map((c, i) => (
                <li key={c.id} style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap", padding: "10px 16px", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 14 }}>
                  <span style={{ minWidth: 0 }}>
                    {c.customerName || c.customerEmail || c.description || "Payment"}
                    <span style={{ display: "block", ...mono }}>
                      {new Date(c.created * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {c.description && (c.customerName || c.customerEmail) ? ` · ${c.description}` : ""}
                    </span>
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    {stripeMoney(c.amount, c.currency)}{" "}
                    <span className={c.refunded ? "pill pill-warn" : c.paid ? "pill pill-ok" : "pill pill-danger"}>
                      {c.refunded ? "Refunded" : c.paid ? "Paid" : c.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {(s.payouts ?? []).length > 0 && (
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>
              Payouts:{" "}
              {s.payouts!.map((p) => `${stripeMoney(p.amount, p.currency)} ${p.status === "paid" ? "paid" : "arriving"} ${new Date(p.arrival_date * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
