"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STEPS, type StepId } from "@/lib/deadlines";
import { prettyDay } from "@/lib/videos";
import type { StepState } from "@/lib/client-work";

/**
 * A video's four steps as chips. Tapping one ticks (or unticks) the
 * same to-do that shows on My dashboard and To-do. Steps that tick
 * themselves (an uploaded video is filmed and edited) show as done
 * without a box to untick.
 */
export function StepChips({ steps, canTick, today }: { steps: Record<StepId, StepState>; canTick: boolean; today: string }) {
  const [state, setState] = useState(steps);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function toggle(id: StepId) {
    const s = state[id];
    if (!s.taskId) return;
    const next = !s.done;
    const prev = state;
    setState((st) => ({ ...st, [id]: { ...st[id], done: next } }));
    setError(null);
    const { error: e } = await supabase.from("tasks").update({ done: next }).eq("id", s.taskId);
    if (e) {
      setState(prev);
      setError(e.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="cw-steps">
      {STEPS.map((st) => {
        const s = state[st.id];
        const overdue = !s.done && s.due < today;
        const live = canTick && Boolean(s.taskId);
        const text = `${st.short}${s.done ? "" : ` · ${prettyDay(s.due, false)}`}`;
        return live ? (
          <button
            key={st.id}
            type="button"
            className="cw-step"
            data-done={s.done || undefined}
            data-overdue={overdue || undefined}
            aria-pressed={s.done}
            title={`${st.label}: ${s.done ? "done (tap to untick)" : `due ${prettyDay(s.due)} (tap when done)`}`}
            onClick={() => toggle(st.id)}
          >
            <span aria-hidden>{s.done ? "✓" : "○"}</span> {text}
          </button>
        ) : (
          <span key={st.id} className="cw-step" data-done={s.done || undefined} data-overdue={overdue || undefined} title={`${st.label}: ${s.done ? "done" : `due ${prettyDay(s.due)}`}`}>
            <span aria-hidden>{s.done ? "✓" : "○"}</span> {text}
          </span>
        );
      })}
      {error && (
        <span className="cw-step-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
