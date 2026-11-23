import { StatTile } from "@/components/StatTile";
import { aiSettings, londonMarks, spendReport } from "@/lib/ai-usage";
import { platformLabel } from "@/lib/social";
import { AiSettingsForm } from "./AiSettingsForm";

/**
 * AI spend: what the CRM's Anthropic API calls cost (the scraper's
 * reads, and the meeting reader, report writer and screenshot reader),
 * from the token counts the API reports, priced with the settings below.
 *
 * Only rendered on the Finance tab, which only the CEO and operations
 * manager can open; the figures come from a database function that
 * refuses anyone else.
 */
const FEATURE: Record<string, string> = {
  scraper_profile: "Scraper: profiles",
  scraper_post: "Scraper: posts",
  meeting: "Meeting reader",
  report: "Report writer",
  screenshot: "Screenshot reader",
};

export async function AiSpendPanel() {
  const [s, r] = await Promise.all([aiSettings(), spendReport()]);
  if (!r) {
    return (
      <section className="ai-spend" aria-labelledby="ai-spend-h">
        <h2 id="ai-spend-h">AI spend</h2>
        <p className="sh-muted">Run database update 0052 in Supabase to start tracking AI spend.</p>
      </section>
    );
  }

  const k = londonMarks();
  const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
  const gbp = (n: number) => `£${n * s.gbp_per_usd < 1 ? (n * s.gbp_per_usd).toFixed(4) : (n * s.gbp_per_usd).toFixed(2)}`;
  // Pounds first; dollars as small print (Anthropic bills in dollars).
  const both = (n: number) => `${gbp(n)} · ${usd(n)}`;
  const projected = k.dayOfMonth > 0 ? (r.month / k.dayOfMonth) * k.daysInMonth : r.month;
  const perRead = r.month_reads ? r.month_read_cost / r.month_reads : null;
  const used = s.monthly_budget_usd > 0 ? r.month / s.monthly_budget_usd : null;

  return (
    <section className="ai-spend" aria-labelledby="ai-spend-h">
      <div className="ai-spend-head">
        <h2 id="ai-spend-h">AI spend</h2>
        <p className="sh-muted">Anthropic API costs, from the token counts each call reports. Not visible to clients.</p>
      </div>

      {used != null && (
        <div className="ai-budget" data-level={used >= 1 ? "over" : used >= 0.8 ? "warn" : "ok"}>
          <div className="ai-budget-text">
            <strong>
              {gbp(r.month)} of {gbp(s.monthly_budget_usd)} this month ({Math.round(used * 100)}%)
            </strong>
            <span>
              {used >= 1
                ? "Budget used up: the scraper is paused until you raise the budget or the month ends."
                : used >= 0.8
                  ? "Over 80% of the budget. At 100% the scraper pauses."
                  : "Within budget."}
            </span>
          </div>
          <div className="ai-budget-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(used * 100))} aria-label="Budget used">
            <span style={{ width: `${Math.min(100, used * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="stat-row">
        <StatTile label="Today" value={gbp(r.today)} hint={usd(r.today)} />
        <StatTile label="This month" value={gbp(r.month)} hint={usd(r.month)} tone={used != null && used >= 0.8 ? "warn" : "neutral"} />
        <StatTile label="Projected this month" value={gbp(projected)} hint={usd(projected)} />
        <StatTile label="Last month" value={gbp(r.last_month)} hint={usd(r.last_month)} />
        <StatTile label="All time" value={gbp(r.all_time)} hint={usd(r.all_time)} />
        <StatTile label="Average per read" value={perRead == null ? "—" : gbp(perRead)} hint={perRead == null ? "no scraper reads yet" : `${r.month_reads} read${r.month_reads === 1 ? "" : "s"} this month`} />
        <StatTile label="Failed calls" value={String(r.month_failed)} hint={`of ${r.month_calls} this month`} tone={r.month_failed ? "warn" : "ok"} />
      </div>

      <div className="ai-breakdowns">
        <table className="ai-table">
          <caption>This month by client</caption>
          <thead>
            <tr>
              <th scope="col">Client</th>
              <th scope="col">Calls</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {r.by_client.length ? (
              r.by_client.map((c) => (
                <tr key={c.client_id ?? "none"}>
                  <td>{c.name}</td>
                  <td>{c.calls}</td>
                  <td>{both(c.cost)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="sh-muted">Nothing yet this month.</td>
              </tr>
            )}
          </tbody>
        </table>
        <table className="ai-table">
          <caption>This month by platform</caption>
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col">Calls</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {r.by_platform.length ? (
              r.by_platform.map((p) => (
                <tr key={p.platform}>
                  <td>{p.platform === "none" ? "Not a platform read" : platformLabel(p.platform as never)}</td>
                  <td>{p.calls}</td>
                  <td>{both(p.cost)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="sh-muted">Nothing yet this month.</td>
              </tr>
            )}
          </tbody>
        </table>
        <table className="ai-table">
          <caption>This month by feature</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Calls</th>
              <th scope="col">Failed</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {r.by_feature.length ? (
              r.by_feature.map((f) => (
                <tr key={f.feature}>
                  <td>{FEATURE[f.feature] ?? f.feature}</td>
                  <td>{f.calls}</td>
                  <td>{f.failed}</td>
                  <td>{both(f.cost)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="sh-muted">Nothing yet this month.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AiSettingsForm
        initial={{ scraperModel: s.scraper_model, postsPerProfile: s.posts_per_profile, gbpPerUsd: s.gbp_per_usd, monthlyBudgetUsd: s.monthly_budget_usd, prices: s.prices }}
      />
    </section>
  );
}
