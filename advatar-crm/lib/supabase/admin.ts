import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Privileged Supabase client using the SERVICE ROLE KEY. This bypasses
 * Row Level Security entirely — it must NEVER be imported into a
 * client component, and must never be created from a value that
 * could reach the browser bundle.
 *
 * The `server-only` import above makes any accidental client-side
 * import a build-time error. Use this only for:
 *   - inviting users (supabase.auth.admin.inviteUserByEmail)
 *   - setting a profile's role immediately after invite
 *   - Fathom webhook ingestion (Phase 6)
 *
 * Every call site using this client must independently verify the
 * calling user is a CEO (or whatever role the action requires) BEFORE
 * doing anything — this client will happily do anything you ask.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
