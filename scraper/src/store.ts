import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** The database, with the service key: this job writes what nobody in the browser can. */
export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (GitHub → Settings → Secrets and variables → Actions).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Settings {
  scraper_model: string;
  posts_per_profile: number;
  prices: Record<string, { input: number; output: number }>;
  monthly_budget_usd: number;
}

const DEFAULTS: Settings = {
  scraper_model: "claude-haiku-5-5",
  posts_per_profile: 3,
  prices: { "claude-haiku-5-5": { input: 0.1, output: 0.5 } },
  monthly_budget_usd: 10,
};

export async function settings(sb: SupabaseClient): Promise<Settings> {
  const { data, error } = await sb.from("ai_settings").select("scraper_model, posts_per_profile, prices, monthly_budget_usd").eq("id", true).maybeSingle();
  if (error) throw new Error(`Couldn't read ai_settings (has database update 0052 been run?): ${error.message}`);
  if (!data) return DEFAULTS;
  return {
    scraper_model: data.scraper_model || DEFAULTS.scraper_model,
    posts_per_profile: Number(data.posts_per_profile ?? 3),
    prices: (data.prices as Settings["prices"]) ?? DEFAULTS.prices,
    monthly_budget_usd: Number(data.monthly_budget_usd ?? 0),
  };
}

/** US dollars for one call, from the prices on the Finance tab. */
export function cost(s: Settings, model: string, inputTokens: number, outputTokens: number): number {
  const price = s.prices[model] ?? Object.entries(s.prices).find(([m]) => model.startsWith(m))?.[1] ?? null;
  if (!price) return 0;
  return (inputTokens / 1e6) * Number(price.input) + (outputTokens / 1e6) * Number(price.output);
}

/** Midnight in London today, the 1st of this month and of last month, as instants. */
export function londonMarks(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  // The instant London's clock shows 00:00 on a given date.
  const at = (yy: number, mm: number, dd: number) => {
    const guess = Date.UTC(yy, mm - 1, dd);
    const shown = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/London" })).getTime();
    const utc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
    return new Date(guess - (shown - utc));
  };
  return {
    hour,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayStart: at(y, m, d),
    monthStart: at(y, m, 1),
    lastMonthStart: m === 1 ? at(y - 1, 12, 1) : at(y, m - 1, 1),
  };
}

/** This month's spend so far, in dollars (all AI use, not just the scraper). */
export async function monthSpend(sb: SupabaseClient): Promise<number> {
  const k = londonMarks();
  const { data, error } = await sb.rpc("ai_spend_report", {
    day_start: k.dayStart.toISOString(),
    month_start: k.monthStart.toISOString(),
    last_month_start: k.lastMonthStart.toISOString(),
  });
  if (error) throw new Error(`Couldn't work out this month's AI spend: ${error.message}`);
  return Number((data as { month?: number } | null)?.month ?? 0);
}
