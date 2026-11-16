"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_DRAFT,
  MAX_REVISION_ROUNDS,
  MAX_VIDEOS_PER_WEEK,
  REVISION_LABELS,
  WEEKDAYS,
  describePackage,
  normalizePackage,
  postingDates,
  videosPerWeek,
  type ClientPackage,
  type PackageDraft,
  type PackagePreset,
  type PackageSettings,
  type PostingMode,
  type RevisionMode,
} from "@/lib/packages";
import {
  deletePresetAction,
  saveClientPackageAction,
  savePresetAction,
} from "@/app/app/clients/[id]/package-actions";

/**
 * The Package tab (0041): what this client gets, and when we post.
 *
 * Editable by the CEO and by an operations manager on this client;
 * everybody else on the team sees the same thing read-only. The
 * database enforces that split — `editable` only decides whether to
 * draw controls that would be refused.
 */

const label: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  margin: "0 0 10px",
};

const hint: CSSProperties = { fontSize: 13, color: "var(--text-3)", lineHeight: 1.6, margin: 0 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={label}>{title}</h3>
      {children}
    </section>
  );
}

function Choice({
  selected,
  onClick,
  title,
  detail,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      className="card card-pad-sm"
      style={{
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
        border: `1px solid ${selected ? "var(--text-1)" : "var(--border)"}`,
        boxShadow: selected ? "inset 0 0 0 1px var(--text-1)" : "none",
        background: "var(--surface, transparent)",
        color: "var(--text-1)",
        font: "inherit",
        flex: "1 1 200px",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: detail ? 4 : 0 }}>{title}</div>
      {detail && <div style={{ fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.5 }}>{detail}</div>}
    </button>
  );
}

function DayPills({
  value,
  onToggle,
  allowed,
  disabled,
}: {
  value: number[];
  onToggle: (day: number) => void;
  allowed?: number[];
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.n);
        const usable = !allowed || allowed.includes(d.n);
        return (
          <button
            key={d.n}
            type="button"
            aria-pressed={on}
            aria-label={d.long}
            disabled={disabled || !usable}
            onClick={() => onToggle(d.n)}
            className="btn"
            style={{
              minWidth: 52,
              background: on ? "var(--text-1)" : undefined,
              color: on ? "var(--bg)" : usable ? undefined : "var(--text-3)",
              opacity: usable ? 1 : 0.4,
            }}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

function toggle(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

function todayIso(): string {
  const now = new Date();
  // The viewer's own calendar day, not UTC's.
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function settingsOf(p: PackageSettings): PackageSettings & PackageDraft {
  return {
    revisions: p.revisions,
    revision_rounds: p.revision_rounds,
    thumbnails: p.thumbnails,
    graphics: p.graphics,
    posting_mode: p.posting_mode,
    posting_weekdays: [...p.posting_weekdays],
    videos_per_week: p.videos_per_week,
    double_post_weekdays: [...p.double_post_weekdays],
  };
}

export function PackagePanel({
  clientId,
  clientName,
  initial,
  presets: initialPresets,
  available,
  editable,
  onPick,
}: {
  /**
   * Adding a new client: there is no client to save to yet, so instead
   * of a Save button the choice is handed up as it changes (null while
   * something is still unchosen). Saved with the client itself.
   */
  onPick?: (value: PackageSettings | null, presetId: string | null) => void;
  clientId: string;
  clientName: string;
  /** Null when nobody has set this client's package yet. */
  initial: ClientPackage | null;
  presets: PackagePreset[];
  /** False until database update 0041 has been run. */
  available: boolean;
  editable: boolean;
}) {
  const router = useRouter();
  // Nothing pre-selected for a client who has no package yet.
  const [draft, setDraft] = useState<PackageDraft>(initial ? settingsOf(initial) : { ...EMPTY_DRAFT });
  // A preset that has since been deleted is not a preset any more.
  // 0041 clears the link itself (on delete set null); this covers the
  // moment in between, and a list the caller cannot read.
  const linkedPreset =
    initial?.preset_id && initialPresets.some((p) => p.id === initial.preset_id) ? initial.preset_id : null;
  const [presetId, setPresetId] = useState<string | null>(linkedPreset);
  const [presets, setPresets] = useState<PackagePreset[]>(initialPresets);
  const [saved, setSaved] = useState<PackageSettings | null>(initial ? settingsOf(initial) : null);
  const [savedPresetId, setSavedPresetId] = useState<string | null>(linkedPreset);
  // Rounds are typed, so keep the raw text: "" means no limit.
  const [roundsText, setRoundsText] = useState(initial?.revision_rounds ? String(initial.revision_rounds) : "");
  const [perWeekText, setPerWeekText] = useState(initial?.videos_per_week ? String(initial.videos_per_week) : "5");
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // What would actually be saved — the same rules the server applies.
  const candidate = useMemo(
    () =>
      normalizePackage({
        ...draft,
        revision_rounds: roundsText.trim() === "" ? null : Number(roundsText),
        videos_per_week: draft.posting_mode === "per_week" ? Number(perWeekText) : null,
      }),
    [draft, roundsText, perWeekText]
  );

  useEffect(() => {
    onPick?.(candidate.ok ? candidate.value : null, presetId);
    // onPick is the parent's setter; only the choice itself matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, presetId]);

  const shown: PackageSettings | null = onPick ? (candidate.ok ? candidate.value : null) : saved;
  const effective: PackageSettings | null = candidate.ok ? candidate.value : saved;
  const dirty = !saved || presetId !== savedPresetId || JSON.stringify(effective) !== JSON.stringify(saved);
  const preview = useMemo(() => (effective ? postingDates(effective, todayIso(), 14) : []), [effective]);
  const presetName_ = presets.find((p) => p.id === presetId)?.name ?? null;
  const savedPresetName = presets.find((p) => p.id === savedPresetId)?.name ?? null;

  if (!available) {
    return (
      <div className="card card-pad" style={{ maxWidth: 720 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "0 0 8px" }}>Package</h2>
        <p style={hint}>
          Packages aren’t switched on yet. Database update <strong>0041</strong> needs running in Supabase; until
          then every client is treated the same way they are today.
        </p>
      </div>
    );
  }

  function update(patch: Partial<PackageDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
    setError(null);
  }

  function applyPreset(id: string) {
    const p = presets.find((x) => x.id === id);
    if (!p) {
      setPresetId(null);
      return;
    }
    setPresetId(p.id);
    setDraft(settingsOf(p));
    setRoundsText(p.revision_rounds ? String(p.revision_rounds) : "");
    setPerWeekText(p.videos_per_week ? String(p.videos_per_week) : "5");
    setConfirmDelete(false);
    setNotice(onPick ? `“${p.name}” filled in below. Change anything that is different for this client.` : `“${p.name}” filled in below. Nothing is saved until you press Save.`);
    setError(null);
  }

  async function save() {
    if (!candidate.ok) {
      setError(candidate.error);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveClientPackageAction(clientId, candidate.value, presetId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(candidate.value);
    setSavedPresetId(presetId);
    setNotice("Saved.");
    router.refresh();
  }

  async function saveAsPreset() {
    if (!candidate.ok) {
      setError(candidate.error);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await savePresetAction(presetName, candidate.value);
    setBusy(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Could not save that package.");
      return;
    }
    const created: PackagePreset = { id: res.id, name: presetName.trim().replace(/\s+/g, " "), ...candidate.value };
    setPresets((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setPresetId(res.id);
    setPresetName("");
    setNotice(`Saved as “${created.name}”. It’s now in the list for every client.`);
  }

  async function removePreset() {
    if (!presetId) return;
    setBusy(true);
    setError(null);
    const res = await deletePresetAction(presetId);
    setBusy(false);
    setConfirmDelete(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPresets((prev) => prev.filter((p) => p.id !== presetId));
    setPresetId(null);
    setNotice("Saved package deleted. Clients already set up from it keep their settings.");
  }

  const readOnly = !editable || busy;
  const doubleAllowed = draft.posting_mode === "daily" ? [1, 2, 3, 4, 5, 6, 7] : draft.posting_weekdays;

  return (
    <div style={{ maxWidth: 760 }}>
      {/* What this client gets, in one line, whatever happens below. */}
      <div className="card card-pad" style={{ marginBottom: 28 }}>
        <p style={label}>{shown ? (onPick ? "Chosen" : "Current package") : "Not set yet"}</p>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 19, margin: "0 0 6px", lineHeight: 1.35 }}>
          {shown ? describePackage(shown) : "Nothing chosen yet"}
        </p>
        <p style={hint}>
          {shown
            ? onPick
              ? `${presetName_ ? `From “${presetName_}”. ` : ""}Roughly ${videosPerWeek(shown) * 4} videos every four weeks.`
              : savedPresetName
              ? `Set up from the “${savedPresetName}” package.`
              : `Roughly ${videosPerWeek(shown) * 4} videos every four weeks.`
            : editable
              ? onPick
                ? "Start from a saved package, or choose each option below. Nothing is picked for you."
                : `Choose ${clientName}’s options below, or start from a saved package. Nothing is assumed until you save.`
              : `Nobody has set ${clientName}’s package yet.`}
        </p>
      </div>

      {editable && (
        <Section title="Start from a saved package">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={presetId ?? ""}
              onChange={(e) => applyPreset(e.target.value)}
              disabled={busy || presets.length === 0}
              style={{ minWidth: 220 }}
              aria-label="Saved package"
            >
              <option value="">{presets.length === 0 ? "No saved packages yet" : "Choose a package…"}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {presetId && presetName_ &&
              (confirmDelete ? (
                <>
                  <button type="button" className="btn" onClick={removePreset} disabled={busy}>
                    Yes, delete “{presetName_}”
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmDelete(false)} disabled={busy}>
                    Keep it
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Delete this saved package
                </button>
              ))}
          </div>
          {presets.length === 0 && (
            <p style={{ ...hint, marginTop: 8 }}>
              Set this client up below, then use “Save as a package” at the bottom to reuse it for the next one.
            </p>
          )}
        </Section>
      )}

      <Section title="The client’s say over videos">
        <div role="radiogroup" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(Object.keys(REVISION_LABELS) as RevisionMode[]).map((mode) => (
            <Choice
              key={mode}
              selected={draft.revisions === mode}
              onClick={() => update({ revisions: mode })}
              title={REVISION_LABELS[mode].title}
              detail={REVISION_LABELS[mode].detail}
              disabled={readOnly}
            />
          ))}
        </div>
        {draft.revisions === "full" && (
          <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, fontSize: 14 }}>
            Rounds of changes per video
            <input
              type="number"
              min={1}
              max={MAX_REVISION_ROUNDS}
              inputMode="numeric"
              value={roundsText}
              placeholder="No limit"
              onChange={(e) => {
                setRoundsText(e.target.value);
                setNotice(null);
                setError(null);
              }}
              disabled={readOnly}
              style={{ width: 110 }}
            />
          </label>
        )}
      </Section>

      <Section title="Extras">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={draft.thumbnails}
              onChange={(e) => update({ thumbnails: e.target.checked })}
              disabled={readOnly}
            />
            Thumbnails
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
            <input
              type="checkbox"
              checked={draft.graphics}
              onChange={(e) => update({ graphics: e.target.checked })}
              disabled={readOnly}
            />
            Graphics and posters
          </label>
        </div>
      </Section>

      <Section title="When we post">
        <div role="radiogroup" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {(
            [
              ["weekdays", "Set days", "The same days every week"],
              ["daily", "Every day", "One a day, seven days a week"],
              ["per_week", "A number a week", "Days chosen as we go"],
            ] as [PostingMode, string, string][]
          ).map(([mode, title, detail]) => (
            <Choice
              key={mode}
              selected={draft.posting_mode === mode}
              onClick={() => update({ posting_mode: mode })}
              title={title}
              detail={detail}
              disabled={readOnly}
            />
          ))}
        </div>

        {draft.posting_mode === "weekdays" && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ ...hint, marginBottom: 8 }}>Days we post</p>
            <DayPills
              value={draft.posting_weekdays}
              onToggle={(d) =>
                update({
                  posting_weekdays: toggle(draft.posting_weekdays, d),
                  // Un-posting a day also un-doubles it.
                  double_post_weekdays: draft.double_post_weekdays.filter(
                    (x) => x !== d || !draft.posting_weekdays.includes(d)
                  ),
                })
              }
              disabled={readOnly}
            />
          </div>
        )}

        {draft.posting_mode === "per_week" && (
          <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, fontSize: 14 }}>
            Videos a week
            <input
              type="number"
              min={1}
              max={MAX_VIDEOS_PER_WEEK}
              inputMode="numeric"
              value={perWeekText}
              onChange={(e) => {
                setPerWeekText(e.target.value);
                setNotice(null);
                setError(null);
              }}
              disabled={readOnly}
              style={{ width: 90 }}
            />
          </label>
        )}

        {(draft.posting_mode === "weekdays" || draft.posting_mode === "daily") && (
          <div>
            <p style={{ ...hint, marginBottom: 8 }}>Days with two videos (optional)</p>
            <DayPills
              value={draft.double_post_weekdays}
              allowed={doubleAllowed}
              onToggle={(d) => update({ double_post_weekdays: toggle(draft.double_post_weekdays, d) })}
              disabled={readOnly}
            />
          </div>
        )}
      </Section>

      <Section title="Next two weeks">
        {preview.length === 0 ? (
          <p style={hint}>No posting days chosen.</p>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {preview.map((d) => (
                <span key={d.date} className="pill">
                  {prettyDate(d.date)}
                  {d.count > 1 ? ` · ×${d.count}` : ""}
                </span>
              ))}
            </div>
            {effective?.posting_mode === "per_week" && (
              <p style={{ ...hint, marginTop: 8 }}>
                A suggested spread — the actual days are set when the month is planned.
              </p>
            )}
          </>
        )}
      </Section>

      {error && (
        <p role="alert" style={{ color: "var(--red, #c0392b)", fontSize: 14, margin: "0 0 12px" }}>
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" style={{ color: "var(--text-2)", fontSize: 14, margin: "0 0 12px" }}>
          {notice}
        </p>
      )}

      {editable && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
            {!onPick && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={save}
                disabled={busy || !dirty || !candidate.ok}
              >
                {busy ? "Saving…" : saved ? "Save changes" : `Save ${clientName}’s package`}
              </button>
            )}
            {!candidate.ok && <span style={{ ...hint, alignSelf: "center" }}>{candidate.error}</span>}
          </div>

          <Section title="Save as a package">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={presetName}
                maxLength={60}
                placeholder="e.g. Growth — 5 a week"
                onChange={(e) => setPresetName(e.target.value)}
                disabled={busy}
                style={{ minWidth: 240, flex: "1 1 240px" }}
                aria-label="Package name"
              />
              <button
                type="button"
                className="btn"
                onClick={saveAsPreset}
                disabled={busy || presetName.trim().length === 0 || !candidate.ok}
              >
                Save as a package
              </button>
            </div>
            <p style={{ ...hint, marginTop: 8 }}>
              Saves the settings above under a name, for setting up the next client in one click. Clients never
              see these names.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
