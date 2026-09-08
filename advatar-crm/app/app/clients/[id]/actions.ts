"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";
import { mapFathomToPlanner } from "@/lib/planner/fathom-mapping";

const DOCUMENTS_BUCKET = "client-documents";

export interface SimpleState {
  error: string | null;
  success: string | null;
}

/**
 * Records a file that the browser has already uploaded to Storage.
 *
 * The upload itself happens client-side (the file bytes never need to
 * pass through the server), under the caller's own session, so the
 * `client-documents` storage policies from
 * 0012_documents_fathom_activity.sql decide whether it is allowed. By
 * the time this runs the object exists; this just files it in the
 * `documents` table and adds a timeline entry.
 */
export async function recordUploadedDocument(input: {
  clientId: string;
  storagePath: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<{ error: string | null; documentId?: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("documents")
    .insert({
      client_id: input.clientId,
      name: input.name,
      type: input.mimeType?.split("/").pop() ?? null,
      status: "delivered",
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not save the document." };
  }

  await logActivity(supabase, {
    clientId: input.clientId,
    kind: "document_uploaded",
    summary: `Document uploaded: ${input.name}`,
    meta: { documentId: data.id },
    actorId: user.id,
  });

  revalidatePath(`/app/clients/${input.clientId}`);
  return { error: null, documentId: data.id };
}

/**
 * Mints a short-lived signed URL for one document.
 *
 * The bucket is private, so this is the only way to read a file. The
 * `documents` row is fetched first under the caller's own RLS — if
 * they can't see the row, they don't get a URL, and the storage
 * policies would refuse them anyway.
 */
export async function getDocumentDownloadUrl(
  documentId: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, url")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return { url: null, error: "Document not found." };

  // Rows created before uploads existed (or by the Fathom webhook)
  // carry a plain external URL instead of a stored file.
  if (!doc.storage_path) {
    return doc.url
      ? { url: doc.url, error: null }
      : { url: null, error: "This document has no file attached." };
  }

  // 60s was enough to hand a URL to window.open, but a phone waking a
  // backgrounded tab, or a slow connection on a large PDF, could land
  // outside it and fail with an expiry error that looked like a
  // permissions problem. Five minutes costs nothing: the URL is
  // single-purpose and only ever reaches the person who asked for it.
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, 300);

  if (error || !data) {
    // Storage answers an RLS refusal the same way it answers a
    // genuinely missing object ("Object not found"), which made a
    // missing storage policy indistinguishable from a deleted file.
    // The `documents` row was readable a moment ago, so the file
    // should exist — say which of the two it actually is.
    const raw = error?.message ?? "";
    const looksLikeDenial = /not found|denied|unauthor|permission|row-level/i.test(raw);

    console.error("[getDocumentDownloadUrl] storage sign failed", {
      documentId,
      storagePath: doc.storage_path,
      message: raw,
    });

    return {
      url: null,
      error: looksLikeDenial
        ? "You don't have permission to open this file, or it's no longer stored. Ask your account manager to re-upload it."
        : raw || "Could not open the file.",
    };
  }

  return { url: data.signedUrl, error: null };
}

export async function deleteDocument(documentId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: doc } = await supabase
    .from("documents")
    .select("name, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  if (error) return { error: error.message };

  // Remove the stored file too, after the row is gone. Order matters:
  // if the row delete fails we haven't destroyed the file, whereas the
  // reverse would leave a row pointing at nothing.
  if (doc?.storage_path) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  }

  await logActivity(supabase, {
    clientId,
    kind: "document_deleted",
    summary: `Document removed: ${doc?.name ?? "file"}`,
    actorId: user?.id ?? null,
  });

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null };
}

/**
 * Attaches a meeting to a client by hand.
 *
 * Fathom has no public API this project has credentials for, so rather
 * than pretend to "connect" to it, this takes what a person can
 * actually get out of Fathom — the recording link, and the summary or
 * notes text — and files it against the client exactly like a webhook
 * delivery would. If notes are supplied they run through the same
 * `mapFathomToPlanner` used by the webhook, so a manually attached
 * meeting can populate the content plan the same way an automatic one
 * does.
 *
 * `fathom_call_id` is `not null unique`, so manual rows get a
 * generated `manual:<uuid>` id and `source = 'manual'` to mark where
 * they came from.
 */
export async function linkFathomMeeting(
  _prev: SimpleState,
  formData: FormData
): Promise<SimpleState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in.", success: null };

  const clientId = String(formData.get("clientId") ?? "");
  const meetingUrl = String(formData.get("meetingUrl") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!clientId) return { error: "Missing client.", success: null };
  if (!meetingUrl && !notes) {
    return { error: "Paste the meeting link, the notes, or both.", success: null };
  }

  if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) {
    return { error: "The meeting link should start with http:// or https://", success: null };
  }

  const { error: insertError } = await supabase.from("fathom_calls").insert({
    fathom_call_id: `manual:${crypto.randomUUID()}`,
    client_id: clientId,
    source: "manual",
    meeting_url: meetingUrl || null,
    title: title || null,
    summary: notes || null,
    received_at: new Date().toISOString(),
    // Already attached to a client by definition, and already seen by
    // the person attaching it — so it shouldn't reappear in the
    // Prospects review queue.
    applied: true,
    reviewed_at: new Date().toISOString(),
    created_by: user.id,
  });

  if (insertError) return { error: insertError.message, success: null };

  // Fold the notes into the client's content plan, the same way the
  // webhook does. Best-effort: a mapping failure must not lose the
  // meeting that was just successfully attached above.
  let plannerNote = "";
  if (notes) {
    try {
      const mapping = mapFathomToPlanner({ summary: notes, title });
      const { data: planner } = await supabase
        .from("planners")
        .select("id, content")
        .eq("client_id", clientId)
        .maybeSingle();

      if (!planner) {
        await supabase.from("planners").insert({
          client_id: clientId,
          content: mapping.plannerContent as any,
          status: "draft",
        });
        plannerNote = " A draft content plan was created from the notes.";
      }
    } catch {
      plannerNote = " (The notes were saved, but couldn't be mapped into a plan.)";
    }
  }

  await logActivity(supabase, {
    clientId,
    kind: "meeting_linked",
    summary: title ? `Meeting attached: ${title}` : "Meeting attached",
    meta: { meetingUrl: meetingUrl || null },
    actorId: user.id,
  });

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null, success: `Meeting attached.${plannerNote}` };
}

/** Free-text note straight onto the timeline. */
export async function addActivityNote(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not signed in.", success: null };

  const clientId = String(formData.get("clientId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!clientId) return { error: "Missing client.", success: null };
  if (!note) return { error: "Write something first.", success: null };

  const { error } = await supabase.from("client_activity").insert({
    client_id: clientId,
    kind: "note",
    summary: note,
    actor_id: user.id,
  });

  if (error) return { error: error.message, success: null };

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null, success: "Note added." };
}

/** Adds one step to a client's onboarding checklist. */
export async function addChecklistItem(
  clientId: string,
  label: string
): Promise<{ error: string | null }> {
  const supabase = createClient();

  const trimmed = label.trim();
  if (!trimmed) return { error: "Write the step first." };

  // Append rather than insert at zero, so a step added later doesn't
  // jump above work already in progress.
  const { data: last } = await supabase
    .from("client_checklist_items")
    .select("position")
    .eq("client_id", clientId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("client_checklist_items").insert({
    client_id: clientId,
    label: trimmed,
    position: (last?.position ?? -1) + 1,
  });

  if (error) return { error: error.message };

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null };
}

/**
 * Turns a task template into real tasks on this client.
 *
 * Due dates are worked out from today plus each item's offset, so one
 * template covers every shoot cycle rather than being tied to fixed
 * calendar dates.
 */
export async function applyTaskTemplate(
  clientId: string,
  templateId: string
): Promise<{ error: string | null; created: number }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: template }, { data: items }] = await Promise.all([
    supabase.from("task_templates").select("name").eq("id", templateId).maybeSingle(),
    supabase
      .from("task_template_items")
      .select("text, offset_days")
      .eq("template_id", templateId)
      .order("position"),
  ]);

  if (!items || items.length === 0) {
    return { error: "That template has no tasks in it.", created: 0 };
  }

  const today = new Date();
  const rows = items.map((item) => {
    const due = new Date(today);
    due.setDate(due.getDate() + (item.offset_days ?? 0));
    return {
      client_id: clientId,
      text: item.text,
      due_date: due.toISOString().slice(0, 10),
      done: false,
    };
  });

  const { error } = await supabase.from("tasks").insert(rows);
  if (error) return { error: error.message, created: 0 };

  await logActivity(supabase, {
    clientId,
    kind: "template_applied",
    summary: `Applied task template: ${template?.name ?? "template"} (${rows.length} tasks)`,
    meta: { templateId },
    actorId: user?.id ?? null,
  });

  revalidatePath(`/app/clients/${clientId}`);
  return { error: null, created: rows.length };
}
