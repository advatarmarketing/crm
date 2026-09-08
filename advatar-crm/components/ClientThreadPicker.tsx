"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClientTeamThread, type TeamMessage } from "./ClientTeamThread";

export interface PickableClient {
  id: string;
  name: string;
}

/**
 * Pick a client, read and write that client's internal team thread.
 *
 * This is the thread from client_team_messages (0020) — the one the
 * client themselves can never see, as opposed to the portal
 * conversation, which lives on the client's own page. The wording
 * below says which is which, because guessing wrong about that is
 * costly.
 *
 * Loads one thread at a time on selection rather than every thread up
 * front: a videographer on six clients doesn't need six histories in
 * the browser to read one.
 */
export function ClientThreadPicker({
  clients,
  currentUserId,
  nameById,
}: {
  clients: PickableClient[];
  currentUserId: string;
  /** Author id → display name, for labelling messages. */
  nameById: Record<string, string | null>;
}) {
  const [selected, setSelected] = useState<PickableClient | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function open(client: PickableClient) {
    setSelected(client);
    setLoading(true);
    setError(null);
    setMessages([]);

    const { data, error: loadError } = await supabase
      .from("client_team_messages")
      .select("id, body, created_at, author_id")
      .eq("client_id", client.id)
      .order("created_at", { ascending: true });

    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setMessages(
      ((data ?? []) as unknown as TeamMessage[]).map((m) => ({
        ...m,
        authorName: m.author_id ? nameById[m.author_id] ?? null : null,
      }))
    );
  }

  if (clients.length === 0) {
    return (
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
        No clients assigned to you yet.
      </p>
    );
  }

  return (
    <div className="dm-layout">
      <div style={{ minWidth: 0 }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {clients.map((c) => {
            const active = selected?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => open(c)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderLeft: active ? "3px solid var(--text-1)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: active ? "var(--surface-2)" : "var(--surface)",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--text-1)",
                  }}
                >
                  {c.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ minWidth: 0 }}>
        {!selected ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>
            Pick a client to see the team&rsquo;s notes about them.
          </p>
        ) : (
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 2px" }}>{selected.name}</h3>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
                margin: "0 0 14px",
              }}
            >
              Internal — the client cannot see this
            </p>

            {error && <p style={{ color: "var(--status-closed)", fontSize: 12.5 }}>{error}</p>}

            {loading ? (
              <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)" }}>Loading…</p>
            ) : (
              <ClientTeamThread
                // Remounting per client resets the composer, which is
                // what you want when switching between two clients.
                key={selected.id}
                clientId={selected.id}
                initialMessages={messages}
                currentUserId={currentUserId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
