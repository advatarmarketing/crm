"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StatTile } from "@/components/StatTile";
import { BarChart } from "@/components/BarChart";
import { todayKey, type VideoCycle } from "@/lib/videos";
import { compact, loadPerformance, monthName, percent, platformLabel, summarise, PLATFORMS, type Group, type PerfVideo } from "@/lib/performance";
import { createReportAction, deleteReportAction, gatherMetricsAction, metricsSetupAction, type GatherResult } from "@/app/app/performance/actions";
import { PostRow, type MetricsSetup } from "./PostRow";

/**
 * How a client's videos are doing: every posted video's numbers added
 * up for the time chosen, split by platform, pillar and month, with
 * anything that is missing listed so it can be filled in on the spot.
 */

type Mode = "all" | "months" | "last" | "custom";

interface SavedReport {
  id: string;
  title: string;
  created_at: string;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return todayKey(d);
}

const day = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function PerformancePanel({ clientId, onOpenVideo }: { clientId: string; onOpenVideo: (videoId: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [videos, setVideos] = useState<PerfVideo[]>([]);
  const [cycles, setCycles] = useState<VideoCycle[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<MetricsSetup>({ screenshots: false, youtube: false });

  const [mode, setMode] = useState<Mode>("all");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [last, setLast] = useState(12);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [gathering, setGathering] = useState(false);
  const [gathered, setGathered] = useState<GatherResult | null>(null);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [madeReport, setMadeReport] = useState<{ id: string; problem: string | null } | null>(null);

  const load = useCallback(async () => {
    const [perf, reps] = await Promise.all([
      loadPerformance(supabase, clientId),
      supabase.from("performance_reports").select("id, title, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    ]);
    setAvailable(perf.available);
    setVideos(perf.videos);
    setCycles(perf.cycles);
    setReports((reps.error ? [] : reps.data ?? []) as SavedReport[]);
    setLoading(false);
  }, [supabase, clientId]);

  useEffect(() => {
    load();
    metricsSetupAction(clientId).then(setSetup);
  }, [load]);

  // The time chosen, as two dates and the words for it.
  const range = useMemo(() => {
    if (mode === "months" && cycles.length > 0) {
      const a = cycles.find((c) => c.id === fromMonth) ?? cycles[cycles.length - 1];
      const picked = cycles.find((c) => c.id === toMonth) ?? a;
      const b = picked.number < a.number ? a : picked;
      return { from: a.starts_on, to: b.ends_on, label: a.id === b.id ? `Month ${a.number}` : `Months ${a.number} to ${b.number}`, detail: `${day(a.starts_on)} to ${day(b.ends_on)}` };
    }
    if (mode === "last") {
      const from = monthsAgo(last);
      return { from, to: todayKey(), label: last === 24 ? "The last 2 years" : last === 12 ? "The last 12 months" : `The last ${last} months`, detail: `${day(from)} to today` };
    }
    if (mode === "custom" && (customFrom || customTo)) {
      return { from: customFrom || null, to: customTo || null, label: `${customFrom ? day(customFrom) : "The start"} to ${customTo ? day(customTo) : "today"}`, detail: "" };
    }
    return { from: null as string | null, to: null as string | null, label: "All time", detail: "Every video so far" };
  }, [mode, cycles, fromMonth, toMonth, last, customFrom, customTo]);

  const s = useMemo(() => summarise(videos, range.from, range.to), [videos, range.from, range.to]);

  async function gather() {
    setGathering(true);
    setError(null);
    const res = await gatherMetricsAction(clientId);
    await load();
    setGathering(false);
    if (res.error) return setError(res.error);
    setGathered(res);
  }

  async function report() {
    setReporting(true);
    setError(null);
    setMadeReport(null);
    const res = await createReportAction(clientId, range.from, range.to, range.label);
    setReporting(false);
    if (res.error || !res.id) return setError(res.error ?? "The report couldn’t be made.");
    setMadeReport({ id: res.id, problem: res.problem ?? null });
    load();
  }

  if (loading) return <p style={{ color: "var(--text-3)" }}>Loading…</p>;
  if (!available) {
    return (
      <div className="card card-pad" style={{ maxWidth: 760 }}>
        <h2 className="vm-title">Performance</h2>
        <p className="vm-hint">
          Performance isn’t switched on yet. Database update <strong>0046</strong> needs running in Supabase.
        </p>
      </div>
    );
  }

  const missing = s.missingLinks.length + s.missingNumbers.length;
  const t = s.totals;
  const bars = (groups: Group[], name: (g: Group) => string) => groups.map((g) => ({ label: `${name(g)} (${g.videos})`, value: g.avgViews }));
  const table = (groups: Group[], first: string, name: (g: Group) => string) => (
    <div className="perf-scroll">
      <table className="perf-table">
        <thead>
          <tr>
            <th>{first}</th>
            <th>Videos</th>
            <th>Views</th>
            <th>Avg views</th>
            <th>Likes</th>
            <th>Comments</th>
            <th>Shares</th>
            <th>Saves</th>
            <th>Engagement</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.name}>
              <th scope="row">{name(g)}</th>
              <td>{g.videos}</td>
              <td className="is-main">{compact(g.views)}</td>
              <td>{compact(g.avgViews)}</td>
              <td>{compact(g.likes)}</td>
              <td>{compact(g.comments)}</td>
              <td>{compact(g.shares)}</td>
              <td>{compact(g.saves)}</td>
              <td>{percent(g.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="vm perf fade-in">
      <header className="perf-head">
        <div>
          <h2 className="vm-title">Performance</h2>
          <p className="vm-dates">
            <span>{range.label}</span>
            {range.detail && <span className="vm-dates-note">{range.detail}</span>}
          </p>
        </div>
        <div className="perf-buttons">
          <button type="button" className="btn btn-primary" onClick={gather} disabled={gathering}>
            {gathering ? "Gathering…" : "Gather all metrics"}
          </button>
          <button type="button" className="btn" onClick={report} disabled={reporting || t.videos === 0} title={t.videos === 0 ? "No numbers in this time yet" : undefined}>
            {reporting ? "Writing the report… (up to a minute)" : "Create report"}
          </button>
        </div>
      </header>

      <div className="perf-range card card-pad-sm">
        <label>
          <span className="vm-label">Time</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="Time">
            <option value="all">All time</option>
            {cycles.length > 0 && <option value="months">By month (Month 1, 2…)</option>}
            <option value="last">The last…</option>
            <option value="custom">Between two dates</option>
          </select>
        </label>
        {mode === "months" && cycles.length > 0 && (
          <>
            <label>
              <span className="vm-label">From</span>
              <select value={fromMonth || cycles[cycles.length - 1].id} onChange={(e) => setFromMonth(e.target.value)} aria-label="From month">
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    Month {c.number}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="vm-label">To</span>
              <select value={toMonth || fromMonth || cycles[cycles.length - 1].id} onChange={(e) => setToMonth(e.target.value)} aria-label="To month">
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    Month {c.number}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {mode === "last" && (
          <label>
            <span className="vm-label">How long</span>
            <select value={last} onChange={(e) => setLast(Number(e.target.value))} aria-label="How long">
              <option value={1}>Month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months (a year)</option>
              <option value={24}>2 years</option>
            </select>
          </label>
        )}
        {mode === "custom" && (
          <>
            <label>
              <span className="vm-label">From</span>
              <input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              <span className="vm-label">To</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="vm-error">
          {error}
        </p>
      )}

      {gathered && (
        <div className={missing ? "perf-note is-warn" : "perf-note is-ok"} role="status">
          <strong>
            {missing === 0
              ? `Everything is in: ${t.videos} video${t.videos === 1 ? "" : "s"} with numbers in this time.`
              : `Gathered ${t.videos} video${t.videos === 1 ? "" : "s"}. ${missing} thing${missing === 1 ? " is" : "s are"} missing, listed below.`}
          </strong>
          {(gathered.platformUpdated ?? 0) > 0 && (
            <span>
              {" "}
              {gathered.platformUpdated} Instagram/TikTok/Facebook link{gathered.platformUpdated === 1 ? "" : "s"} refreshed from the connected accounts.
            </span>
          )}
          {gathered.platformProblem && <span> {gathered.platformProblem}</span>}
          {gathered.youtubeUpdated > 0 && <span> {gathered.youtubeUpdated} YouTube link{gathered.youtubeUpdated === 1 ? "" : "s"} refreshed just now.</span>}
          {gathered.youtubeWaiting > 0 && (
            <span>
              {" "}
              {gathered.youtubeWaiting} YouTube link{gathered.youtubeWaiting === 1 ? "" : "s"} can be fetched automatically once a YOUTUBE_API_KEY is added in Vercel.
            </span>
          )}
          {gathered.youtubeProblem && <span> {gathered.youtubeProblem}</span>}
        </div>
      )}

      {madeReport && (
        <div className="perf-note is-ok" role="status">
          <strong>The report is ready.</strong>{" "}
          <Link href={`/app/clients/${clientId}/reports/${madeReport.id}`}>Open it to save as PDF or Word</Link>
          {madeReport.problem && <span> {madeReport.problem}</span>}
        </div>
      )}

      <div className="perf-tiles">
        <div className="perf-views">
          <StatTile label="Views" value={compact(t.views)} tone="accent" hint={t.videos ? `${compact(Math.round(t.views / t.videos))} per video` : "No numbers yet"} />
        </div>
        <StatTile label="Videos counted" value={String(t.videos)} hint={s.inRange > t.videos ? `${s.inRange - t.videos} more without numbers` : "All with numbers"} tone={s.inRange > t.videos ? "warn" : "neutral"} />
        <StatTile label="Likes" value={compact(t.likes)} tone="danger" />
        <StatTile label="Comments" value={compact(t.comments)} tone="info" />
        <StatTile label="Shares" value={compact(t.shares)} tone="ok" />
        <StatTile label="Saves" value={compact(t.saves)} tone="violet" />
        <StatTile label="Engagement rate" value={percent(t.rate)} hint="Likes, comments, shares and saves per view" />
      </div>

      {missing > 0 && (
        <section className="card card-pad perf-missing">
          <h3 className="vm-sub">Missing ({missing})</h3>
          {s.missingLinks.length > 0 && (
            <>
              <p className="vm-hint">Posted, but no link has been added, so there is nothing to count:</p>
              <ul className="perf-list">
                {s.missingLinks.map((v) => (
                  <li key={v.id}>
                    <span>
                      <strong>{v.name}</strong>
                      {v.title ? ` · ${v.title}` : ""}
                    </span>
                    <button type="button" className="btn" onClick={() => onOpenVideo(v.id)}>
                      Add its link
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {s.missingNumbers.length > 0 && (
            <>
              <p className="vm-hint">
                Linked, but no numbers yet.{" "}
                {setup.screenshots ? "Open the post, screenshot its numbers, and paste or choose the screenshot here. Or type them in." : "Open the post and type its numbers in."}
              </p>
              <div className="perf-posts">
                {s.missingNumbers.map((m) => (
                  <PostRow key={m.post.id} post={m.post} editable setup={setup} heading={`${m.name}${m.title ? ` · ${m.title}` : ""}`} onChanged={load} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {t.videos === 0 ? (
        <p className="card card-pad vm-hint">
          No numbers in this time yet. Tick a video as posted on the Videos tab, add where it was posted, and its numbers show up here.
        </p>
      ) : (
        <>
          <section className="card card-pad perf-card">
            <h3 className="vm-sub">By content pillar</h3>
            <p className="vm-hint">Average views per video, with the number of videos in brackets. Fewer than three is too few to judge.</p>
            <BarChart data={bars(s.byPillar, (g) => g.name)} formatValue={compact} />
            {table(s.byPillar, "Pillar", (g) => g.name)}
          </section>

          <section className="card card-pad perf-card">
            <h3 className="vm-sub">By platform</h3>
            <div className="perf-platforms">
              {s.byPlatform.map((g) => (
                <div key={g.name} className="perf-platform" style={{ ["--pc" as string]: PLATFORMS.find((p) => p.id === g.name)?.rgb }}>
                  <span className="post-platform">{platformLabel(g.name)}</span>
                  <strong>{compact(g.views)}</strong>
                  <span className="vm-hint">
                    views from {g.videos} post{g.videos === 1 ? "" : "s"} · {percent(g.rate)} engagement
                  </span>
                </div>
              ))}
            </div>
            {table(s.byPlatform, "Platform", (g) => platformLabel(g.name))}
          </section>

          {s.byType.length > 0 && (
            <section className="card card-pad perf-card">
              <h3 className="vm-sub">By type of video</h3>
              {table(s.byType, "Type", (g) => g.name)}
            </section>
          )}

          {s.byMonth.length > 1 && (
            <section className="card card-pad perf-card">
              <h3 className="vm-sub">Month by month</h3>
              <p className="vm-hint">Total views of the videos posted in each calendar month.</p>
              <BarChart data={s.byMonth.map((g) => ({ label: `${monthName(g.name)} (${g.videos})`, value: g.views }))} formatValue={compact} />
            </section>
          )}

          <section className="card card-pad perf-card">
            <h3 className="vm-sub">Every video, most watched first</h3>
            <div className="perf-scroll">
              <table className="perf-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Video</th>
                    <th>Pillar</th>
                    <th>Views</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Shares</th>
                    <th>Saves</th>
                    <th>Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {s.ranked.map((v, i) => (
                    <tr key={v.id}>
                      <td>{i + 1}</td>
                      <th scope="row">
                        <button type="button" className="vm-link" onClick={() => onOpenVideo(v.id)}>
                          {v.name}
                        </button>
                        {v.title && <span className="perf-title">{v.title}</span>}
                      </th>
                      <td>{v.pillar ?? "–"}</td>
                      <td className="is-main">{compact(v.views)}</td>
                      <td>{compact(v.likes)}</td>
                      <td>{compact(v.comments)}</td>
                      <td>{compact(v.shares)}</td>
                      <td>{compact(v.saves)}</td>
                      <td>{percent(v.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {reports.length > 0 && (
        <section className="card card-pad perf-card">
          <h3 className="vm-sub">Reports</h3>
          <ul className="perf-list">
            {reports.map((r) => (
              <li key={r.id}>
                <span>
                  <Link href={`/app/clients/${clientId}/reports/${r.id}`}>{r.title}</Link>
                  <span className="vm-hint"> · made {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <button
                  type="button"
                  className="vm-link"
                  onClick={async () => {
                    const res = await deleteReportAction(r.id);
                    if (res.error) return setError(res.error);
                    load();
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
