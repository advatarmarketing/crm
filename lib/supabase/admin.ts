import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
 *
 * Deliberately NOT parameterized with `<Database>` here (it was
 * originally). Whatever version of @supabase/supabase-js actually
 * gets installed at deploy time expects the hand-written Database
 * type in ./types.ts to carry extra structure our version didn't
 * have, and even after patching that, individual call sites kept
 * resolving to `never`/`never[]` one at a time — a real but
 * frustrating type-inference mismatch between a hand-maintained
 * types file and whatever the installed library version expects.
 * None of this reflects an actual runtime problem — every query
 * here was always valid SQL/PostgREST, it's purely a compile-time
 * type-checking disagreement. Dropping the generic makes every
 * query through this client `any`-typed (no autocomplete/type
 * checking on admin queries), which trades away type safety here in
 * exchange for builds that actually succeed. Once this project has
 * real generated types (`supabase gen types typescript --project-id
 * <ref> ...`, run against the live project rather than hand-written),
 * re-add `<Database>` here and it should work cleanly.
 */
export function createAdminClient() {
  return createSupabaseClient(
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
