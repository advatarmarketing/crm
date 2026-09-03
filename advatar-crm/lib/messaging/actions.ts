"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Phase 10: shared server actions for the chat feature. Used by both
 * the staff/ceo/videographer chat UI (components/ChatShell.tsx, at
 * /app/messages) and the client portal's single-thread view
 * (/app/portal/messages) — the logic is identical for every role
 * because 0007_messaging.sql's RLS policies are what actually decide
 * who can do what; nothing here branches on role. Called directly as
 * functions from client components (not via a <form action>), the
 * same way any "use server" export can be.
 */

export async function sendMessage(threadId: string, body: string): Promise<{ error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const trimmed = body.trim();
  if (!trimmed) return { error: "Message can't be empty." };

  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!caller?.role) return { error: "Couldn't determine your role." };

  // sender_role is computed here, server-side, from the caller's own
  // profile row — never trusted from client input — so it can't be
  // spoofed by passing a different role in the request.
  const { error } = await supabase.from("messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    sender_role: caller.role,
    body: trimmed,
  });

  return { error: error?.message ?? null };
}

/**
 * "Opening a thread marks its unread messages read=true" — marks
 * every message in this thread that (a) isn't already read and (b)
 * wasn't sent by the caller themselves (marking your own sent
 * messages "read" is meaningless). Scoped only by thread_id + these
 * two conditions; 0007_messaging.sql's RLS is what actually confines
 * this to threads the caller is allowed to touch at all — this
 * function doesn't re-check role or assignment itself.
 */
export async function markThreadRead(threadId: string): Promise<{ error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("messages")
    .update({ read: true })
    .eq("thread_id", threadId)
    .eq("read", false)
    .neq("sender_id", user.id);

  return { error: error?.message ?? null };
}

/**
 * ceo/staff only (enforced by RLS on message_threads' insert — a
 * videographer/client calling this gets an insert error and the
 * catch-and-retry path below, which will find nothing and correctly
 * report failure rather than silently creating anything). Finds this
 * client's one thread, or creates it if this is the first message
 * anyone's ever sent them.
 */
export async function ensureThreadForClient(clientId: string): Promise<{ threadId: string | null; error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { threadId: null, error: "Not signed in." };

  const { data: existing } = await supabase.from("message_threads").select("id").eq("client_id", clientId).maybeSingle();
  if (existing) return { threadId: existing.id, error: null };

  const { data: created, error } = await supabase.from("message_threads").insert({ client_id: clientId }).select("id").single();

  if (error) {
    // Either a permissions error (caller isn't ceo/staff), or two
    // people opened the same brand-new client's thread at once and
    // the other request's insert already satisfied the `unique`
    // constraint on client_id. Re-fetch rather than assuming which.
    const { data: retry } = await supabase.from("message_threads").select("id").eq("client_id", clientId).maybeSingle();
    if (retry) return { threadId: retry.id, error: null };
    return { threadId: null, error: error.message };
  }

  return { threadId: created.id, error: null };
}
