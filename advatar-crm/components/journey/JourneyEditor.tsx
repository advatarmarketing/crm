"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clientsText, earnText } from "@/lib/journey-format";
import type { JourneyLevel, JourneyPath, JourneyStep } from "@/lib/journey";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : `s${Date.now()}`);
const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s.replace(/[£,\s]/g, "")))) || 0);
const lines = (s: string) => s.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);

function stepsFrom(text: string, existing: JourneyStep[]): JourneyStep[] {
  const pool = [...existing];
  return lines(text).map((t) => {
    const i = pool.findIndex((s) => s.text === t);
    return i >= 0 ? pool.splice(i, 1)[0] : { id: newId(), text: t.slice(0, 300) };
  });
}

export function JourneyEditor({ paths, minimums }: { paths: JourneyPath[]; minimums: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const done = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2500);
    router.refresh();
  };

  async function saveLevel(l: JourneyLevel, patch: Partial<JourneyLevel>) {
    setError(null);
    const { error: e } = await supabase.from("journey_levels").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (e) return setError(e.message);
    setOpen(null);
    done(`Saved ${patch.title ?? l.title}.`);
  }

  async function addLevel(p: JourneyPath) {
    setError(null);
    const position = (p.levels[p.levels.length - 1]?.position ?? -1) + 1;
    const { error: e } = await supabase
      .from("journey_levels")
      .insert({ path_id: p.id, key: `level-${newId()}`, position, title: "New level", paid: true, can_do: [], steps: [] });
    if (e) return setError(e.message);
    done("Level added at the end.");
  }

  async function removeLevel(l: JourneyLevel) {
    if (!confirm(`Delete "${l.title}"? Anyone on it will need a new level.`)) return;
    const { error: e } = await supabase.from("journey_levels").delete().eq("id", l.id);
    if (e) return setError(e.message);
    done("Level deleted.");
  }

  async function move(p: JourneyPath, i: number, dir: -1 | 1) {
    const a = p.levels[i];
    const b = p.levels[i + dir];
    if (!a || !b) return;
    setError(null);
    const r1 = await supabase.from("journey_levels").update({ position: b.position }).eq("id", a.id);
    const r2 = await supabase.from("journey_levels").update({ position: a.position }).eq("id", b.id);
    if (r1.error || r2.error) return setError((r1.error ?? r2.error)!.message);
    done("Order changed.");
  }

  async function setMinimum(p: JourneyPath, levelId: string) {
    setError(null);
    const { error: e } = await supabase.from("journey_private").upsert({ path_id: p.id, minimum_level_id: levelId || null, updated_at: new Date().toISOString() }, { onConflict: "path_id" });
    if (e) return setError(e.message);
    done("Minimum level saved (only you can see it).");
  }

  async function savePath(p: JourneyPath, name: string, word: string, description: string) {
    setError(null);
    const { error: e } = await supabase.from("journey_paths").update({ name: name.trim() || p.name, clients_word: word.trim() || "clients", description: description.trim() || null }).eq("id", p.id);
    if (e) return setError(e.message);
    done("Path saved.");
  }

  async function addPath() {
    const name = prompt("Name of the new path (for example: Editor, Operations)");
    if (!name?.trim()) return;
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `path-${newId()}`;
    const { error: e } = await supabase.from("journey_paths").insert({ key, name: name.trim(), position: paths.length });
    if (e) return setError(e.message);
    done("Path added. Give it some levels.");
  }

  return (
    <div className="je">
      {error && (
        <p className="cw-alert" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="je-saved" role="status">
          {saved}
        </p>
      )}
      {paths.map((p) => (
        <section key={p.id} className="je-path">
          <PathHead p={p} onSave={savePath} />
          <label className="je-min">
            <span>Minimum level (private: only you see this)</span>
            <select value={minimums[p.id] ?? ""} onChange={(e) => setMinimum(p, e.target.value)}>
              <option value="">Not set</option>
              {p.levels.map((l, i) => (
                <option key={l.id} value={l.id}>
                  {i + 1}. {l.title}
                </option>
              ))}
            </select>
          </label>
          <ol className="je-levels">
            {p.levels.map((l, i) => (
              <li key={l.id} className="card card-pad-sm">
                {open === l.id ? (
                  <LevelForm l={l} onCancel={() => setOpen(null)} onSave={(patch) => saveLevel(l, patch)} />
                ) : (
                  <div className="je-level">
                    <div>
                      <strong>
                        {i + 1}. {l.title}
                      </strong>
                      {minimums[p.id] === l.id && <span className="pill pill-warn">Minimum</span>}
                      {l.vision && <span className="pill pill-violet">Vision</span>}
                      <p className="je-meta">
                        {[clientsText(l, p.clients_word), earnText(l), `${l.steps.length} step${l.steps.length === 1 ? "" : "s"} to move up`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="je-actions">
                      <button type="button" className="btn" onClick={() => move(p, i, -1)} disabled={i === 0} aria-label={`Move ${l.title} up`}>
                        ↑
                      </button>
                      <button type="button" className="btn" onClick={() => move(p, i, 1)} disabled={i === p.levels.length - 1} aria-label={`Move ${l.title} down`}>
                        ↓
                      </button>
                      <button type="button" className="btn" onClick={() => setOpen(l.id)}>
                        Edit
                      </button>
                      <button type="button" className="btn script-delete" onClick={() => removeLevel(l)}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className="btn" onClick={() => addLevel(p)}>
            + Add a level to {p.name}
          </button>
        </section>
      ))}
      <button type="button" className="btn btn-primary" onClick={addPath}>
        + Add a path
      </button>
    </div>
  );
}

function PathHead({ p, onSave }: { p: JourneyPath; onSave: (p: JourneyPath, name: string, word: string, description: string) => void }) {
  const [name, setName] = useState(p.name);
  const [word, setWord] = useState(p.clients_word);
  const [description, setDescription] = useState(p.description ?? "");
  const changed = name !== p.name || word !== p.clients_word || description !== (p.description ?? "");
  return (
    <div className="je-path-head pg-edit">
      <div className="script-grid">
        <label>
          <span>Path name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </label>
        <label>
          <span>Counted in (e.g. clients, new clients a month)</span>
          <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={60} />
        </label>
      </div>
      <label>
        <span>One line about it</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </label>
      {changed && (
        <div>
          <button type="button" className="btn btn-primary" onClick={() => onSave(p, name, word, description)}>
            Save path
          </button>
        </div>
      )}
    </div>
  );
}

function LevelForm({ l, onSave, onCancel }: { l: JourneyLevel; onSave: (patch: Partial<JourneyLevel>) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(l.title);
  const [summary, setSummary] = useState(l.summary ?? "");
  const [canDo, setCanDo] = useState(l.can_do.join("\n"));
  const [cmin, setCmin] = useState(l.clients_min?.toString() ?? "");
  const [cmax, setCmax] = useState(l.clients_max?.toString() ?? "");
  const [cnote, setCnote] = useState(l.clients_note ?? "");
  const [emin, setEmin] = useState(l.earn_min?.toString() ?? "");
  const [emax, setEmax] = useState(l.earn_max?.toString() ?? "");
  const [paid, setPaid] = useState(l.paid);
  const [vision, setVision] = useState(l.vision);
  const [steps, setSteps] = useState(l.steps.map((s) => s.text).join("\n"));
  return (
    <div className="pg-edit">
      <label>
        <span>Level name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </label>
      <label>
        <span>What this level means</span>
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
      </label>
      <label>
        <span>What you can do: one per line</span>
        <textarea rows={3} value={canDo} onChange={(e) => setCanDo(e.target.value)} />
      </label>
      <div className="script-grid">
        <label>
          <span>Clients from</span>
          <input inputMode="numeric" value={cmin} onChange={(e) => setCmin(e.target.value)} />
        </label>
        <label>
          <span>Clients to (blank = &ldquo;+&rdquo;)</span>
          <input inputMode="numeric" value={cmax} onChange={(e) => setCmax(e.target.value)} />
        </label>
        <label>
          <span>Client note (e.g. or 1 big client)</span>
          <input value={cnote} onChange={(e) => setCnote(e.target.value)} maxLength={120} />
        </label>
      </div>
      <div className="script-grid">
        <label>
          <span>Earnings from (£ a month)</span>
          <input inputMode="numeric" value={emin} onChange={(e) => setEmin(e.target.value)} disabled={!paid} />
        </label>
        <label>
          <span>Earnings to (£, blank = &ldquo;+&rdquo;)</span>
          <input inputMode="numeric" value={emax} onChange={(e) => setEmax(e.target.value)} disabled={!paid} />
        </label>
      </div>
      <div className="je-checks">
        <label>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid
        </label>
        <label>
          <input type="checkbox" checked={vision} onChange={(e) => setVision(e.target.checked)} /> Part of the long-term vision
        </label>
      </div>
      <label>
        <span>To move up: one step per line</span>
        <textarea rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
      <div className="script-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            onSave({
              title: title.trim() || l.title,
              summary: summary.trim() || null,
              can_do: lines(canDo).slice(0, 20),
              clients_min: num(cmin),
              clients_max: num(cmax),
              clients_note: cnote.trim() || null,
              earn_min: paid ? num(emin) : null,
              earn_max: paid ? num(emax) : null,
              paid,
              vision,
              steps: stepsFrom(steps, l.steps).slice(0, 30),
            })
          }
        >
          Save level
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
