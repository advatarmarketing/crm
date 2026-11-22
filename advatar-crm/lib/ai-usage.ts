import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Every Anthropic API call the CRM makes is logged here (ai_usage, 0052)
 * with the token counts the API itself reports, priced from the Finance
 * tab's settings. The scraper (scraper/) logs its own calls the same way.
 *
 * Nothing here is ever sent to a browser except through the Finance tab,
 * which only the CEO and operations manager can open.
 */

export interface AiSettings {
  scraper_model: string;
  posts_per_profile: number;
  prices: Record<string, { input: number; output: number }>;
  gbp_per_usd: number;
  monthly_budget_usd: number;
  updated_at: string | null;
}

export const DEFAULT_SETTINGS: AiSettings = {
  scraper_model: "claude-haiku-5-5",
  posts_per_profile: 3,
  prices: {
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
    "claude-sonnet-5-5": { input: 2, output: 10 },
    "claude-opus-5-5": { input: 4, output: 20 },
  },
  gbp_per_usd: 0.79,
  monthly_budget_usd: 10,
  updated_at: null,
};

/** Read with the service key: used by the server only. */
export async function aiSettings(): Promise<AiSettings> {
  try {
    const { data } = await createAdminClient().from("ai_settings").select("*").eq("id", true).maybeSingle();
    if (!data) return DEFAULT_SETTINGS;
    return {
      scraper_model: data.scraper_model || DEFAULT_SETTINGS.scraper_model,
      posts_per_profile: Number(data.posts_per_profile ?? 3),
      prices: (data.prices as AiSettings["prices"]) ?? DEFAULT_SETTINGS.prices,
      gbp_per_usd: Number(data.gbp_per_usd ?? 0.79),
      monthly_budget_usd: Number(data.monthly_budget_usd ?? 0),
      updated_at: data.updated_at ?? null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function priceFor(s: AiSettings, model: string): { input: number; output: number } | null {
  return s.prices[model] ?? Object.entries(s.prices).find(([m]) => model.startsWith(m))?.[1] ?? null;
}

export function costOf(s: AiSettings, model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(s, model);
  return p ? (inputTokens / 1e6) * Number(p.input) + (outputTokens / 1e6) * Number(p.output) : 0;
}

/**
 * Log one call. `usage` is the response's usage field (null when the
 * call failed before the API answered). Never throws: a logging problem
 * must not break the feature that made the call.
 */
export async function logAiCall(entry: {
  feature: "meeting" | "report" | "screenshot";
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  ok: boolean;
  error?: string | null;
  clientId?: string | null;
  platform?: string | null;
}) {
  try {
    const s = await aiSettings();
    const input = entry.usage?.input_tokens ?? 0;
    const output = entry.usage?.output_tokens ?? 0;
    await createAdminClient()
      .from("ai_usage")
      .insert({
        feature: entry.feature,
        client_id: entry.clientId ?? null,
        platform: entry.platform ?? null,
        read_kind: null,
        model: entry.model,
        input_tokens: input,
        output_tokens: output,
        cost_usd: costOf(s, entry.model, input, output),
        ok: entry.ok,
        error: entry.error ? entry.error.slice(0, 300) : null,
      });
  } catch {
    // Before 0052, or the database is unreachable: the feature still works.
  }
}

/** Midnight in London today, and the 1st of this and last month, as instants. */
export function londonMarks(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const at = (yy: number, mm: number, dd: number) => {
    const guess = Date.UTC(yy, mm - 1, dd);
    const shown = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/London" })).getTime();
    const utc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    return new Date(guess - (shown - utc));
  };
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dayStart: at(y, m, d), monthStart: at(y, m, 1), lastMonthStart: m === 1 ? at(y - 1, 12, 1) : at(y, m - 1, 1), dayOfMonth: d, daysInMonth };
}

export interface SpendReport {
  today: number;
  month: number;
  last_month: number;
  all_time: number;
  month_calls: number;
  month_failed: number;
  month_reads: number;
  month_read_cost: number;
  by_client: { client_id: string | null; name: string; cost: number; calls: number }[];
  by_platform: { platform: string; cost: number; calls: number }[];
  by_feature: { feature: string; cost: number; calls: number; failed: number }[];
}

/** The Finance tab's figures. Uses the service key: callers check who's asking first. */
export async function spendReport(): Promise<SpendReport | null> {
  const k = londonMarks();
  const { data, error } = await createAdminClient().rpc("ai_spend_report", {
    day_start: k.dayStart.toISOString(),
    month_start: k.monthStart.toISOString(),
    last_month_start: k.lastMonthStart.toISOString(),
  });
  if (error || !data) return null;
  const n = (v: unknown) => Number(v ?? 0);
  const d = data as Record<string, unknown>;
  return {
    today: n(d.today),
    month: n(d.month),
    last_month: n(d.last_month),
    all_time: n(d.all_time),
    month_calls: n(d.month_calls),
    month_failed: n(d.month_failed),
    month_reads: n(d.month_reads),
    month_read_cost: n(d.month_read_cost),
    by_client: ((d.by_client as SpendReport["by_client"]) ?? []).map((r) => ({ ...r, cost: n(r.cost), calls: n(r.calls) })),
    by_platform: ((d.by_platform as SpendReport["by_platform"]) ?? []).map((r) => ({ ...r, cost: n(r.cost), calls: n(r.calls) })),
    by_feature: ((d.by_feature as SpendReport["by_feature"]) ?? []).map((r) => ({ ...r, cost: n(r.cost), calls: n(r.calls), failed: n(r.failed) })),
  };
}

/**
 * How much of this month's budget is used, as a share (0.82 = 82%).
 * Staff see only this, never amounts. Null when there's no budget set or
 * it can't be worked out.
 */
export async function budgetUse(): Promise<number | null> {
  const [s, r] = await Promise.all([aiSettings(), spendReport()]);
  if (!r || !s.monthly_budget_usd || s.monthly_budget_usd <= 0) return null;
  return r.month / s.monthly_budget_usd;
}
