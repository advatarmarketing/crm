"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * The Finance tab's AI settings (ai_settings, 0052): prices, exchange
 * rate, monthly budget, and the scraper's model and posts per profile.
 * Saved with the caller's own session: the database only lets the CEO
 * and operations manager change them.
 */
export async function saveAiSettingsAction(input: {
  scraperModel: string;
  postsPerProfile: string;
  gbpPerUsd: string;
  monthlyBudgetUsd: string;
  prices: { model: string; input: string; output: string }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const model = input.scraperModel.trim();
  if (!/^[a-z0-9][a-z0-9.-]{2,60}$/.test(model)) return { ok: false, error: "That model name doesn't look right, e.g. claude-haiku-5-5." };
  const posts = Number(input.postsPerProfile);
  if (!Number.isInteger(posts) || posts < 0 || posts > 12) return { ok: false, error: "Posts per profile should be a whole number from 0 to 12." };
  const rate = Number(input.gbpPerUsd);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 10) return { ok: false, error: "The exchange rate should be like 0.79 (pounds per dollar)." };
  const budget = Number(input.monthlyBudgetUsd);
  if (!Number.isFinite(budget) || budget < 0 || budget > 100000) return { ok: false, error: "The monthly budget should be a dollar amount, e.g. 10. Use 0 for no limit." };

  const prices: Record<string, { input: number; output: number }> = {};
  for (const p of input.prices) {
    const m = p.model.trim();
    if (!m && !p.input && !p.output) continue;
    const i = Number(p.input);
    const o = Number(p.output);
    if (!/^[a-z0-9][a-z0-9.-]{2,60}$/.test(m) || !Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0) {
      return { ok: false, error: `Check the price row for "${m || "a model"}": dollars per million tokens, e.g. 0.10 and 0.50.` };
    }
    prices[m] = { input: i, output: o };
  }
  if (!prices[model]) return { ok: false, error: `Add a price for ${model}, or the scraper's costs can't be worked out.` };

  const { data, error } = await supabase
    .from("ai_settings")
    .update({ scraper_model: model, posts_per_profile: posts, gbp_per_usd: rate, monthly_budget_usd: budget, prices, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error) return { ok: false, error: /ai_settings/.test(error.message) ? "Run database update 0052 in Supabase first." : error.message };
  if (!data?.length) return { ok: false, error: "Only the CEO or operations manager can change these." };
  revalidatePath("/app/finance");
  return { ok: true };
}
