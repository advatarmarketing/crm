"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAiSettingsAction } from "./ai-actions";

/** Pounds typed in, dollars stored; anything that isn't a number is passed on for the server to reject. */
function toUsd(gbp: string, rate: string): string {
  const g = Number(gbp.replace(/[£,\s]/g, ""));
  const r = Number(rate);
  return Number.isFinite(g) && r > 0 ? String(g / r) : gbp;
}

export function AiSettingsForm({
  initial,
}: {
  initial: { scraperModel: string; postsPerProfile: number; gbpPerUsd: number; monthlyBudgetUsd: number; prices: Record<string, { input: number; output: number }> };
}) {
  const [model, setModel] = useState(initial.scraperModel);
  const [posts, setPosts] = useState(String(initial.postsPerProfile));
  const [rate, setRate] = useState(String(initial.gbpPerUsd));
  // The budget is typed in pounds and stored in dollars (what Anthropic bills).
  const [budget, setBudget] = useState(String(Math.round(initial.monthlyBudgetUsd * initial.gbpPerUsd * 100) / 100));
  const [prices, setPrices] = useState(
    Object.entries(initial.prices).map(([m, p]) => ({ model: m, input: String(p.input), output: String(p.output) }))
  );
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  const save = () =>
    start(async () => {
      setNote(null);
      const r = await saveAiSettingsAction({ scraperModel: model, postsPerProfile: posts, gbpPerUsd: rate, monthlyBudgetUsd: toUsd(budget, rate), prices });
      setNote(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <div className="ai-settings">
      <h3>Settings</h3>
      <div className="ai-settings-grid">
        <label>
          <span>Monthly budget (£)</span>
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-describedby="ai-budget-hint" />
          <small id="ai-budget-hint">Warn at 80%, pause the scraper at 100%. 0 = no limit.</small>
        </label>
        <label>
          <span>Exchange rate (£ per $1)</span>
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label>
          <span>Scraper model</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
        </label>
        <label>
          <span>Latest posts read per profile</span>
          <input inputMode="numeric" value={posts} onChange={(e) => setPosts(e.target.value)} />
        </label>
      </div>
      <table className="ai-table ai-prices">
        <caption>Prices (US dollars per million tokens)</caption>
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Input</th>
            <th scope="col">Output</th>
            <th scope="col">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {prices.map((p, i) => (
            <tr key={i}>
              <td>
                <input value={p.model} onChange={(e) => setPrices((xs) => xs.map((x, j) => (j === i ? { ...x, model: e.target.value } : x)))} aria-label="Model" spellCheck={false} />
              </td>
              <td>
                <input inputMode="decimal" value={p.input} onChange={(e) => setPrices((xs) => xs.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} aria-label={`Input price for ${p.model}`} />
              </td>
              <td>
                <input inputMode="decimal" value={p.output} onChange={(e) => setPrices((xs) => xs.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))} aria-label={`Output price for ${p.model}`} />
              </td>
              <td>
                <button type="button" className="sh-link" onClick={() => setPrices((xs) => xs.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ai-settings-foot">
        <button type="button" className="sh-link" onClick={() => setPrices((xs) => [...xs, { model: "", input: "", output: "" }])}>
          + Add a model
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {note && <span className={note.ok ? "sh-note" : "sh-error"}>{note.text}</span>}
      </div>
    </div>
  );
}
