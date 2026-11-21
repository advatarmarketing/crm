"use server";

import { createClient } from "@/lib/supabase/server";

/** The welcome and tour have been shown to this account (0048). */
export async function markTourSeenAction(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;
  await supabase.rpc("mark_tour_seen");
}
