import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { compact, monthName, percent, platformLabel, type Group } from "@/lib/performance";
import type { ReportContent } from "@/lib/performance/read";
import { ReportButtons } from "./report-buttons";

export const dynamic = "force-dynamic";

/**
 * One saved performance report, laid out to be read, printed, saved
 * as a PDF, or opened in Word. Headings, paragraphs, lists and plain
 * tables only, so it comes out the same in all four.
 *
 * Row level security (0046) decides who can open it: management and
 * the staff assigned to the client.
 */
export default async function ReportPage({ params }: { params: { id: string; reportId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("performance_reports")
    .select("id, client_id, title, content, created_at")
    .eq("id", params.reportId)
    .eq("client_id", params.id)
    .maybeSingle();
  if (!data) notFound();

  const report = data as { id: string; client_id: string; title: string; content: ReportContent; created_at: string };
  const c = report.content;
  const s = c.summary;
  const t = s.totals;
  const made = new Date(c.madeAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const period =
    c.from || c.to
      ? `${c.from ? new Date(`${c.from}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "The start"} to ${
          c.to ? new Date(`${c.to}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "today"
        }`
      : "Everything posted so far";

  const groupTable = (title: string, first: string, groups: Group[], name: (g: Group) => string, note?: string) =>
    groups.length > 0 && (
      <section>
        <h2>{title}</h2>
        {note && <p className="report-note">{note}</p>}
        <table>
          <thead>
            <tr>
              <th>{first}</th>
              <th>Videos</th>
              <th>Views</th>
              <th>Average views</th>
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
                <td>{name(g)}</td>
                <td>{g.videos}</td>
                <td>
                  <strong>{compact(g.views)}</strong>
                </td>
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
      </section>
    );

  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <section>
        <h2>{title}</h2>
        <ul>
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </section>
    );

  return (
    <main className="page-narrow report-page" style={{ maxWidth: 900 }}>
      <div className="report-bar">
        <Link href={`/app/clients/${report.client_id}?tab=performance`} className="back-link">
          ← Performance
        </Link>
        <ReportButtons filename={`${c.clientName} - ${c.range} - performance report`} />
      </div>

      <article className="report" id="report">
        <header>
          <p className="report-kicker">Performance report · Advatar</p>
          <h1>{c.clientName}</h1>
          <p className="report-period">
            {c.range} · {period}
          </p>
          <p className="report-note">Prepared {made}</p>
        </header>

        <section>
          <h2>{c.analysis.headline}</h2>
          <p>{c.analysis.overview}</p>
        </section>

        <section>
          <h2>The numbers</h2>
          <table className="report-totals">
            <tbody>
              <tr>
                <th>Views</th>
                <th>Videos</th>
                <th>Likes</th>
                <th>Comments</th>
                <th>Shares</th>
                <th>Saves</th>
                <th>Engagement rate</th>
              </tr>
              <tr>
                <td>
                  <strong>{compact(t.views)}</strong>
                </td>
                <td>{t.videos}</td>
                <td>{compact(t.likes)}</td>
                <td>{compact(t.comments)}</td>
                <td>{compact(t.shares)}</td>
                <td>{compact(t.saves)}</td>
                <td>{percent(t.rate)}</td>
              </tr>
            </tbody>
          </table>
          <p className="report-note">Engagement rate is likes, comments, shares and saves for every view.</p>
        </section>

        {list("What worked", c.analysis.worked)}
        {list("What needs improving", c.analysis.improve)}
        {list("What we tested", c.analysis.tested)}
        {list("What we’ll do next", c.analysis.next)}

        {groupTable("By content pillar", "Pillar", s.byPillar, (g) => g.name, "Ordered by average views per video.")}
        {groupTable("By platform", "Platform", s.byPlatform, (g) => platformLabel(g.name))}
        {groupTable("By type of video", "Type", s.byType, (g) => g.name)}
        {s.byMonth.length > 1 && groupTable("Month by month", "Posted in", s.byMonth, (g) => monthName(g.name))}

        <section>
          <h2>Every video</h2>
          <p className="report-note">Most watched first.</p>
          <table>
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
                  <td>
                    {v.title ?? v.name}
                    {v.title && (
                      <>
                        <br />
                        <small>{v.name}</small>
                      </>
                    )}
                  </td>
                  <td>{v.pillar ?? "–"}</td>
                  <td>
                    <strong>{compact(v.views)}</strong>
                  </td>
                  <td>{compact(v.likes)}</td>
                  <td>{compact(v.comments)}</td>
                  <td>{compact(v.shares)}</td>
                  <td>{compact(v.saves)}</td>
                  <td>{percent(v.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {s.missingLinks.length + s.missingNumbers.length > 0 && (
          <p className="report-note report-internal">
            Not counted: {s.missingLinks.length} posted video{s.missingLinks.length === 1 ? "" : "s"} with no link and {s.missingNumbers.length} link
            {s.missingNumbers.length === 1 ? "" : "s"} with no numbers when this was made.
          </p>
        )}
      </article>
    </main>
  );
}
