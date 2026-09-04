import { createClient } from "@/lib/supabase/server";
import { reviewAndOpen } from "./actions";

// No role check in this file — fathom_calls RLS (Phase 3) is
// ceo/staff full access and nothing else, so a videographer or
// client session's query below just comes back empty. The page is
// also outside videographer/client's ALLOWED_PREFIXES in
// middleware.ts, so neither role can even load this route.
export default async function ProspectsPage() {
  const supabase = createClient();

  const { data: calls } = await supabase
    .from("fathom_calls")
    .select("id, client_id, summary, received_at, clients(name)")
    .eq("applied", true)
    .is("reviewed_at", null)
    .order("received_at", { ascending: false });

  type Row = {
    id: string;
    client_id: string | null;
    summary: string | null;
    received_at: string | null;
    clients: { name: string } | null;
  };
  const rows = (calls ?? []) as unknown as Row[];

  return (
    <main className="page page-sm">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 8px" }}>
        Prospects
      </h1>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-3)", margin: "0 0 28px" }}>
        Discovery calls Fathom auto-mapped into a draft client + plan. Nothing here has been
        confirmed by a person yet — open each one and check it before publishing.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontFamily: "var(--font-body)", color: "var(--text-3)" }}>
          Nothing to review right now.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((row) => (
            <li
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "16px 18px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: 15, color: "var(--text-1)" }}>
                  {row.clients?.name ?? "Untitled prospect"}
                </div>
                {row.summary && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      color: "var(--text-2)",
                      maxWidth: 520,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.summary}
                  </p>
                )}
                {row.received_at && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                    {new Date(row.received_at).toLocaleString()}
                  </span>
                )}
              </div>

              {row.client_id ? (
                <form action={reviewAndOpen}>
                  <input type="hidden" name="callId" value={row.id} />
                  <input type="hidden" name="clientId" value={row.client_id} />
                  <button
                    type="submit"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      padding: "10px 16px",
                      borderRadius: 20,
                      border: "1px solid var(--text-1)",
                      background: "var(--text-1)",
                      color: "var(--bg)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Review &amp; Open
                  </button>
                </form>
              ) : (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--status-closed)" }}>
                  No client created
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
