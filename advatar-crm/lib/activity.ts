import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Appends one entry to a client's activity timeline.
 *
 * Deliberately never throws and never returns an error: a timeline
 * entry failing to write must not roll back or block the thing it was
 * describing. Losing "invoice marked paid" from the log is annoying;
 * failing to mark the invoice paid because the log write failed would
 * be much worse.
 *
 * Some events are logged by database triggers instead (client created,
 * stage changed — see 0012_documents_fathom_activity.sql), because
 * those can happen through paths that never touch a server action,
 * including a hand edit in the Supabase dashboard. Use this helper for
 * everything that does go through an action.
 */
export async function logActivity(
  supabase: SupabaseClient<any, any, any>,
  entry: {
    clientId: string;
    kind: string;
    summary: string;
    meta?: Record<string, unknown>;
    actorId?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from("client_activity").insert({
      client_id: entry.clientId,
      kind: entry.kind,
      summary: entry.summary,
      meta: entry.meta ?? null,
      actor_id: entry.actorId ?? null,
    });
  } catch {
    // Intentionally swallowed — see the note above.
  }
}
