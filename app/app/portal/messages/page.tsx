import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessageBubbleList, type ChatMessage } from "@/components/messaging/MessageBubbleList";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { MarkThreadRead } from "@/components/messaging/MarkThreadRead";

// Phase 10: this page was read-only through Phase 9 ("Sending a
// message from here arrives in Phase 10" — that comment is gone now).
// `messages: client send own` / `messages: client update own`
// (0007_messaging.sql) are what actually allow the send + mark-read
// below; this page just calls them.
//
// No thread-creation here: a client can only ever send into a thread
// staff has already started (0007_messaging.sql deliberately didn't
// give `client` an insert policy on `message_threads`) — if none
// exists yet, the composer renders disabled instead of trying.
// PortalLayout's existing RealtimeRefresh subscription (Phase 9)
// already covers "a new thread/message appeared" for this page by
// re-running this server component entirely — that's why this page
// doesn't need its own Realtime subscription the way ChatShell does;
// it gets a live refresh "for free" from the shell it's nested in.
export default async function PortalMessagesPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("client_id").eq("id", user.id).single();

  if (!profile?.client_id) {
    return null; // see PortalLayout
  }

  const { data: thread } = await supabase
    .from("message_threads")
    .select("id")
    .eq("client_id", profile.client_id)
    .maybeSingle();

  const { data: messages } = thread
    ? await supabase
        .from("messages")
        .select("id, body, sender_id, sender_role, read, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
    : { data: null };

  return (
    <main style={{ padding: "40px 32px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", minHeight: "60vh" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: "0 0 24px" }}>
        Messages
      </h1>

      {thread && <MarkThreadRead threadId={thread.id} />}

      <div style={{ flex: 1 }}>
        <MessageBubbleList messages={(messages ?? []) as ChatMessage[]} currentUserId={user.id} />
      </div>

      <MessageComposer
        threadId={thread?.id ?? null}
        disabled={!thread}
        disabledMessage="Your team hasn't started this conversation yet — check back soon."
      />
    </main>
  );
}
