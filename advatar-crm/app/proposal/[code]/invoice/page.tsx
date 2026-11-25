import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadByCode } from "@/lib/proposals/server";
import { money, totals } from "@/lib/proposals/pricing";
import { PrintButton } from "@/components/proposals/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice · Advatar", robots: { index: false, follow: false } };

/** The invoice for an accepted proposal, ready to print or save as PDF. */
export default async function InvoicePage({ params }: { params: { code: string } }) {
  const p = await loadByCode(params.code);
  if (!p || !p.acceptedAt || !p.choice) notFound();
  const t = totals(p.content, p.choice);
  const pkg = p.content.packages.find((x) => x.id === p.choice!.package)?.name ?? p.choice.package;
  const paid = p.status === "paid";
  return (
    <main className="doc-print">
      <div className="doc-print-bar">
        <span>{paid ? "Paid" : p.paymentMethod === "cash" ? "Awaiting cash payment" : "Awaiting payment"}</span>
        <PrintButton />
      </div>
      <h1>Invoice {p.invoiceNumber}</h1>
      <p>
        <b>Advatar</b> · for <b>{p.deal.business}</b>
        {p.deal.contact ? ` (${p.deal.contact})` : ""} · {p.acceptedEmail}
        <br />
        Date: {new Date(p.acceptedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      <table>
        <thead>
          <tr>
            <th>{pkg} package, monthly</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {t.slides.map((s) =>
            s.lines.map((l, i) => (
              <tr key={`${s.slide.id}-${i}`}>
                <td>
                  {s.slide.title}: {l.label} <small>({l.sum})</small>
                </td>
                <td>{money(l.price)}</td>
              </tr>
            ))
          )}
          <tr>
            <td>
              <b>Monthly total</b>
            </td>
            <td>
              <b>{money(t.monthly)}</b>
            </td>
          </tr>
          {p.choice.plan === "upfront" && (
            <tr>
              <td>
                3 months upfront ({p.content.discountPct}% off {money(t.monthly * 3)})
              </td>
              <td>{money(t.upfront)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="doc-print-due">
        {paid ? "Paid" : "Due now"}: <b>{money(p.amount ?? t.dueNow)}</b>
        {p.choice.plan === "monthly" ? ", then monthly" : ""}
      </p>
      {t.budgetTotal > 0 && <p>Suggested ad budget of {money(t.budgetTotal)} a month is paid by you directly to the ad platforms and isn&rsquo;t part of this invoice.</p>}
    </main>
  );
}
