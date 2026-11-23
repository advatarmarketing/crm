import Link from "next/link";
import { TodoPanel } from "@/components/TodoPanel";
import { StepChips } from "./StepChips";
import { HEALTH_LABEL, aheadText, type Meter } from "@/lib/deadlines";
import { prettyDay, todayKey } from "@/lib/videos";
import type { ClientWork, WorkVideo } from "@/lib/client-work";

/**
 * The first thing anyone on the team sees when they open a client: what
 * needs doing now, what's coming up, and when each video has to be
 * ready. The lists are the same to-dos as My dashboard and To-do.
 */
export function ClientWorkDashboard({
  work,
  client,
  canTick,
  canAdd,
  me,
  videosHref,
  guideHref,
}: {
  work: ClientWork;
  client: { id: string; name: string };
  canTick: boolean;
  /** Videographers tick but don't add (tasks RLS, 0019). */
  canAdd: boolean;
  me: string | null;
  /** Where "see every video" goes. */
  videosHref?: string;
  /** "How to make this" for a pillar (Part 3); null until guides exist. */
  guideHref?: (pillar: string) => string | null;
}) {
  const today = todayKey();
  const late = work.videos.filter((v) => v.health === "late");

  return (
    <div className="cw">
      <MeterCard meter={work.meter} />

      {late.length > 0 && (
        <p className="cw-alert" role="alert">
          {late.length === 1 ? "1 video is" : `${late.length} videos are`} within 3 days of going out and not finished:{" "}
          {late.map((v) => `${v.label} (${prettyDay(v.publish)})`).join(", ")}.
        </p>
      )}

      {!work.stepsAvailable && (
        <p className="access-note" style={{ margin: "0 0 20px" }}>
          Automatic Film / Edit / Send / Post to-dos for each video start once database update 0053 has been run in Supabase.
        </p>
      )}

      <div className="cw-lists">
        <section className="card card-pad-sm" aria-labelledby="cw-now">
          <h2 id="cw-now" className="cw-h">Needs doing now</h2>
          <p className="cw-sub">Overdue and due this week.</p>
          <TodoPanel
            initialTasks={work.now}
            editable={canAdd}
            canTick={canTick}
            fixedClient={client}
            defaultAssignee={me}
            showClientLink={false}
            showPerson
            priorityAvailable={work.priorityAvailable}
            emptyMessage="Nothing due this week. Nice."
          />
        </section>
        <section className="card card-pad-sm" aria-labelledby="cw-up">
          <h2 id="cw-up" className="cw-h">Coming up</h2>
          <p className="cw-sub">The next four weeks.</p>
          <TodoPanel
            initialTasks={work.upcoming}
            editable={false}
            canTick={canTick}
            showClientLink={false}
            showPerson
            priorityAvailable={work.priorityAvailable}
            emptyMessage="Nothing scheduled for the next four weeks yet."
          />
        </section>
      </div>

      <section aria-labelledby="cw-videos" className="cw-videos">
        <div className="cw-videos-head">
          <h2 id="cw-videos" className="cw-h">Videos and their deadlines</h2>
          {videosHref && <Link href={videosHref}>Every video →</Link>}
        </div>
        <p className="cw-sub">
          Each video should be sent for approval by the Friday of the week before it goes out. The latest is 3 days before.
        </p>
        {work.videos.length === 0 ? (
          <p className="cw-empty">No videos scheduled for the next five weeks. Add them from the Videos tab or the content plan.</p>
        ) : (
          <ol className="cw-video-list">
            {work.videos.map((v) => (
              <VideoRow key={v.id} v={v} canTick={canTick} today={today} guide={v.pillar && guideHref ? guideHref(v.pillar) : null} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function VideoRow({ v, canTick, today, guide }: { v: WorkVideo; canTick: boolean; today: string; guide: string | null }) {
  const tone = v.health === "late" ? "danger" : v.health === "behind" ? "warn" : v.health === "done" ? "ok" : "neutral";
  return (
    <li className="cw-video" data-health={v.health}>
      <div className="cw-video-date">
        <strong>{prettyDay(v.publish)}</strong>
        <span>goes out</span>
      </div>
      <div className="cw-video-main">
        <div className="cw-video-title">
          <span>{v.label}</span>
          {v.pillar && <span className="pill">{v.pillar}</span>}
          {!v.hasScript && !v.finished && <span className="pill pill-info">No script yet</span>}
          {guide && (
            <Link href={guide} className="cw-guide">
              How to make this →
            </Link>
          )}
        </div>
        <StepChips steps={v.steps} canTick={canTick} today={today} />
        {!v.finished && (
          <p className="cw-video-dates">
            {v.health === "late" ? (
              <>
                Should have been sent by <strong>{prettyDay(v.target)}</strong>. Finish it now.
              </>
            ) : v.health === "behind" ? (
              <>
                Target was {prettyDay(v.target)} · send by <strong>{prettyDay(v.latest)}</strong> at the latest
              </>
            ) : (
              <>
                Send by <strong>{prettyDay(v.target)}</strong> · latest {prettyDay(v.latest)}
              </>
            )}
          </p>
        )}
      </div>
      <span className={tone === "neutral" ? "pill" : `pill pill-${tone}`}>{v.health === "done" ? "Finished" : HEALTH_LABEL[v.health]}</span>
    </li>
  );
}

export function MeterCard({ meter, compact = false, name, href }: { meter: Meter; compact?: boolean; name?: string; href?: string }) {
  const body = (
    <>
      <div className="cw-meter-top">
        {name && <span className="cw-meter-name">{name}</span>}
        <span className="cw-meter-health">{HEALTH_LABEL[meter.health]}</span>
      </div>
      <div className="cw-meter-big">{aheadText(meter)}</div>
      <div className="cw-meter-bar" aria-hidden>
        <span style={{ width: `${Math.min(100, (meter.weeksAhead / 2) * 100)}%` }} />
      </div>
      {!compact && (
        <p className="cw-meter-detail">
          {meter.next
            ? todayKey() > meter.next.latest
              ? `The video going out ${prettyDay(meter.next.publish)} isn't finished and should have been sent by ${prettyDay(meter.next.target)}.`
              : todayKey() > meter.next.target
                ? `The video going out ${prettyDay(meter.next.publish)} has missed its target (${prettyDay(meter.next.target)}). Send it by ${prettyDay(meter.next.latest)} at the latest.`
                : `Next to finish: the video going out ${prettyDay(meter.next.publish)}. Send it by ${prettyDay(meter.next.target)} (latest ${prettyDay(meter.next.latest)}).`
            : meter.finishedUntil
              ? `Everything is finished up to ${prettyDay(meter.finishedUntil)}.`
              : "No videos scheduled yet."}
          {" "}Goal: 2 weeks ahead.
        </p>
      )}
      {compact && meter.next && <p className="cw-meter-detail">Next: send by {prettyDay(meter.next.target)}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="cw-meter" data-health={meter.health}>
      {body}
    </Link>
  ) : (
    <div className="cw-meter" data-health={meter.health} role="status" aria-label={`${HEALTH_LABEL[meter.health]}, ${aheadText(meter)}`}>
      {body}
    </div>
  );
}
