"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Move an SOP between Filming, Editing and General (0054). Management only; RLS checks. */
export function StageSelect({ id, stage, title }: { id: string; stage: string | null; title: string }) {
  const [value, setValue] = useState(stage ?? "");
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();
  return (
    <label className="stage-select">
      <span>Section</span>
      <select
        value={value}
        aria-label={`Section for ${title}`}
        onChange={async (e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          setError(null);
          const { error: err } = await supabase.from("resources").update({ stage: next || null }).eq("id", id);
          if (err) {
            setValue(prev);
            setError(err.message);
            return;
          }
          router.refresh();
        }}
      >
        <option value="filming">Filming</option>
        <option value="editing">Editing</option>
        <option value="">General</option>
      </select>
      {error && <span role="alert" style={{ color: "var(--danger-fg)", fontSize: 12 }}>{error}</span>}
    </label>
  );
}
