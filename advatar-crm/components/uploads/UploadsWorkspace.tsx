"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProfileRole, SubmissionVisibility } from "@/lib/supabase/types";
import type { AssetEntry, UploadEntry } from "@/lib/uploads";
import type { ClientChoice } from "@/components/SchedulePanel";
import { EmptyState } from "@/components/EmptyState";
import { UploadCard, type UploadAbilities } from "./UploadCard";
import { AssetsPanel } from "./AssetsPanel";
import { submitWorkAction } from "@/app/app/uploads/actions";
import { field, subheading, meta, errorText } from "./styles";

type SubTab = "videos" | "assets";
type StatusFilter = "all" | "open" | "changes" | "approved";

/**
 * The Uploads tab, for whichever login is looking at it.
 *
 * One component rather than four pages, because the thing being shown
 * is the same thing — a video, the conversation about it, and the
 * material it was made from. What changes per role is who may do what,
 * and that is a handful of booleans rather than a different screen:
 *
 *   videographer        uploads cuts, replies, works the checklist
 *   operations manager  reviews, comments, shares with the client
 *   CEO                 the same, across every client
 *   staff               the same, on the clients they're assigned
 *   client              watches, comments, adds their own material
 *
 * Building it four times would mean fixing every bug four times, and
 * the four would drift — which is exactly how the submission workflow
 * ended up living in three places before this.
 *
 * Every one of these booleans is presentation only. The enforcement is
 * in Postgres (0020, 0024, 0028): a client's session cannot read a
 * team-audience note, and a videographer's cannot approve their own
 * work, whatever this component renders.
 */
export function UploadsWorkspace({
  role,
  currentUserId,
  uploads,
  assets,
  clients,
  uploadsProblem,
  assetsProblem,
  fixedClientId = null,
}: {
  role: ProfileRole;
  currentUserId: string;
  uploads: UploadEntry[];
  assets: AssetEntry[];
  clients: ClientChoice[];
  uploadsProblem: string | null;
  assetsProblem: string | null;
  fixedClientId?: string | null;
}) {
  const [tab, setTab] = useState<SubTab>("videos");

  const isClient = role === "client";
  const canReview = role === "ceo" || role === "operations_manager" || role === "staff";
  const canSubmit = role === "videographer";

  const abilities: UploadAbilities = {
    canReview,
    canSubmit,
    // Everyone who isn't a bystander can speak to the client: the
    // reviewer because they own the relationship, the videographer
    // because a question about a note is best answered by whoever
    // shot it, the client because it's their video.
    canTalkToClient: canReview || canSubmit || isClient,
    isClient,
  };

  const waiting = uploads.filter((u) => u.status === "submitted" || u.status === "in_review").length;
  const needsChanges = uploads.filter((u) => u.status === "changes_requested").length;
  const openItems = uploads.reduce((n, u) => n + u.checklist.filter((c) => !c.done).length, 0);

  // Narrowing the list, for when there are more videos than fit on a
  // screen. Held here rather than in the URL: it is a way of looking
  // at the page, not a place, and putting it in the address bar would
  // mean every filter change pushed a history entry to back out of.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [clientFilter, setClientFilter] = useState("");

  const visible = uploads.filter((u) => {
    if (statusFilter === "open" && !(u.status === "submitted" || u.status === "in_review")) return false;
    if (statusFilter === "changes" && u.status !== "changes_requested") return false;
    if (statusFilter === "approved" && u.status !== "approved") return false;
    if (clientFilter && u.client_id !== clientFilter) return false;

    if (query.trim()) {
      // Title and client, because those are the two things anybody
      // actually remembers about a cut they are looking for.
      const haystack = `${u.title} ${u.clientName ?? ""} ${u.personName ?? ""}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }

    return true;
  });

  // Below this there is nothing to narrow, and a filter bar over four
  // rows is furniture that makes the page look busier than it is.
  const showFilters = uploads.length > 5;

  return (
    <div>
      {/* The sub-tab row. Same visual language as the nav's tabs —
          mono, uppercase, an accent underline on the current one — so
          a second level of tabs reads as a second level rather than as
          a different app. */}
      <div
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--border)",
          marginBottom: 22,
          overflowX: "auto",
        }}
      >
        {(
          [
            { id: "videos" as const, label: "Videos", count: uploads.length },
            { id: "assets" as const, label: "Raw footage & assets", count: assets.length },
          ]
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                background: "none",
                border: "none",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                color: active ? "var(--text-1)" : "var(--text-3)",
                padding: "12px 13px",
                marginBottom: -1,
                cursor: "pointer",
                transition: "color 0.15s ease, border-color 0.15s ease",
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{ ...meta, marginLeft: 7, color: "inherit", opacity: 0.7 }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "videos" ? (
        <>
          {/* A one-line state of play, and only where it means
              something. A client doesn't need to know how many things
              are in the team's review queue. */}
          {!isClient && uploads.length > 0 && (
            <p style={{ ...meta, margin: "-6px 0 16px" }}>
              {[
                `${waiting} awaiting review`,
                needsChanges > 0 ? `${needsChanges} needing changes` : null,
                canSubmit && openItems > 0 ? `${openItems} things to fix` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {showFilters && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or client"
                aria-label="Search uploads"
                style={{ ...field, flex: "1 1 200px", maxWidth: 280 }}
              />

              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "open" as const, label: "Awaiting review" },
                    { id: "changes" as const, label: "Changes" },
                    { id: "approved" as const, label: "Approved" },
                  ]
                ).map((chip) => {
                  const on = statusFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setStatusFilter(chip.id)}
                      aria-pressed={on}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10.5,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "7px 11px",
                        borderRadius: "var(--radius-pill)",
                        border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                        background: on ? "var(--accent)" : "var(--surface)",
                        color: on ? "var(--text-on-accent)" : "var(--text-3)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* Only when there is more than one client to choose
                  between — on a videographer with two, this is a
                  dropdown with nothing to decide. */}
              {!isClient && clients.length > 2 && (
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  aria-label="Show one client's videos"
                  style={{ ...field, maxWidth: 200 }}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {uploadsProblem ? (
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--danger-fg)",
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                lineHeight: 1.55,
              }}
            >
              The video list couldn&rsquo;t be loaded.
              <span style={{ display: "block", ...meta, marginTop: 6 }}>{uploadsProblem}</span>
            </p>
          ) : uploads.length === 0 ? (
            <EmptyState
              title={isClient ? "No videos yet" : canSubmit ? "Nothing uploaded yet" : "Nothing to review"}
              body={
                isClient
                  ? "When your team shares a cut with you it appears here, and you can comment on it."
                  : canSubmit
                    ? "Upload a cut and it goes to the team for review. Once it's approved it lands in your Portfolio."
                    : "Videos appear here as soon as a videographer uploads them."
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nothing matches"
              body="No video here fits that search and those filters. Clear them to see everything again."
              compact
            />
          ) : (
            <>
              {visible.length !== uploads.length && (
                <p style={{ ...meta, margin: "0 0 10px" }}>
                  Showing {visible.length} of {uploads.length}
                </p>
              )}
              {/* A tighter gap than a card list would use: these are
                  rows, and rows read as a list when they sit close
                  together. Every one starts shut. */}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {visible.map((upload) => (
                  <UploadCard
                    key={upload.id}
                    upload={upload}
                    abilities={abilities}
                    currentUserId={currentUserId}
                    showPerson={canReview}
                  />
                ))}
              </ul>
            </>
          )}

          {canSubmit && (
            <NewUploadForm clients={clients} onDone={() => undefined} />
          )}
        </>
      ) : (
        <AssetsPanel
          assets={assets}
          clients={clients}
          currentUserId={currentUserId}
          isClient={isClient}
          fixedClientId={fixedClientId}
          canShare={canReview || canSubmit}
          problem={assetsProblem}
        />
      )}
    </div>
  );
}

/**
 * Handing a new cut in.
 *
 * Goes through a server action rather than an insert from here,
 * because submitting is three things at once and two of them the
 * videographer's own session may not do: filling the matching content
 * plan slot (planners are management-writable) and telling the client
 * (`notifications` grants insert to nobody). See
 * app/app/uploads/actions.ts.
 */
function NewUploadForm({ clients, onDone }: { clients: ClientChoice[]; onDone: () => void }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(clients.length === 1 ? clients[0].id : "");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<SubmissionVisibility>("team_only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const router = useRouter();

  async function submit() {
    setBusy(true);
    setError(null);
    setNote(null);

    const result = await submitWorkAction({ title, clientId, url, notes, visibility });

    setBusy(false);

    if (!result.ok) return setError(result.error);

    setTitle("");
    setClientId(clients.length === 1 ? clients[0].id : "");
    setUrl("");
    setNotes("");
    setVisibility("team_only");
    setCreating(false);
    setNote(result.note);
    onDone();
    router.refresh();
  }

  if (!creating) {
    return (
      <div style={{ marginTop: 18 }}>
        {note && <SideEffectNote text={note} />}
        <button type="button" onClick={() => setCreating(true)} className="btn btn-primary">
          + Upload a video
        </button>
        <p style={{ ...meta, margin: "10px 0 0", maxWidth: "60ch", lineHeight: 1.5 }}>
          Once a cut is approved it appears in your Portfolio automatically — there&rsquo;s
          nothing to copy across.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 18,
        padding: "15px 16px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What is it? e.g. Bright Co — March Reel"
          style={{ ...field, flex: "2 1 220px" }}
        />
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          aria-label="Which client is this for?"
          style={{ ...field, flex: "1 1 160px" }}
        >
          <option value="">Which client?</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Link to the video (Drive, Frame.io, Dropbox…)"
        style={{ ...field, width: "100%", marginBottom: 10 }}
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Anything the reviewer should know (optional)"
        style={{ ...field, width: "100%", resize: "vertical", marginBottom: 12 }}
      />

      {/* Two radio cards rather than a dropdown, because this is the
          one choice on the form with a consequence the client will
          notice — sharing puts the video on their content plan, on
          their Uploads tab, and tells them. */}
      <fieldset style={{ border: "none", margin: "0 0 14px", padding: 0 }}>
        <legend style={{ ...subheading, padding: 0 }}>Who can see it</legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              { value: "team_only" as const, label: "Team only", hint: "For review. The client sees nothing." },
              {
                value: "team_and_client" as const,
                label: "Team and client",
                hint: "Lands on their Uploads tab and they're told.",
              },
            ]
          ).map((option) => {
            const chosen = visibility === option.value;
            return (
              <label
                key={option.value}
                style={{
                  flex: "1 1 200px",
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${chosen ? "var(--accent)" : "var(--border)"}`,
                  boxShadow: chosen ? "0 0 0 2px var(--accent-ring)" : "none",
                  background: "var(--surface)",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="radio"
                    name="upload-visibility"
                    checked={chosen}
                    onChange={() => setVisibility(option.value)}
                    style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                  />
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>
                    {option.label}
                  </span>
                </span>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    color: "var(--text-2)",
                    marginTop: 4,
                    marginLeft: 24,
                  }}
                >
                  {option.hint}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={submit} disabled={busy} className="btn btn-primary">
          {busy ? "Uploading…" : "Upload for review"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setError(null);
          }}
          className="btn"
        >
          Cancel
        </button>
      </div>

      {error && <p style={errorText}>{error}</p>}
    </div>
  );
}

/**
 * What happened to the content plan.
 *
 * Worth saying out loud: a videographer can't see the plan from here,
 * so filling in a slot would otherwise be an invisible side effect of
 * pressing Upload.
 */
function SideEffectNote({ text }: { text: string }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 12.5,
        color: "var(--ok-fg)",
        background: "var(--ok-bg)",
        border: "1px solid var(--ok-border)",
        borderRadius: "var(--radius-sm)",
        padding: "9px 12px",
        margin: "0 0 12px",
      }}
    >
      {text}
    </p>
  );
}
