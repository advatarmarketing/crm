"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type Task = Database["public"]["Tables"]["tasks"]["Row"];

export function TaskList({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const supabase = createClient();

  async function toggleDone(id: string, done: boolean) {
    const prev = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done } : t))); // optimistic

    const { error } = await supabase.from("tasks").update({ done }).eq("id", id);
    if (error) setTasks(prev); // revert
  }

  if (tasks.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
        No tasks yet.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {tasks.map((task) => (
        <li
          key={task.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 4px",
            opacity: task.done ? 0.55 : 1,
          }}
        >
          <input
            type="checkbox"
            checked={task.done}
            onChange={(e) => toggleDone(task.id, e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--text-1)", cursor: "pointer" }}
          />
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "var(--text-1)",
              textDecoration: task.done ? "line-through" : "none",
            }}
          >
            {task.text}
          </span>
          {task.due_date && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>
              {task.due_date}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
