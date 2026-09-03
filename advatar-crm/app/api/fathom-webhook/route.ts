import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapFathomToPlanner } from "@/lib/planner/fathom-mapping";

/**
 * Fathom AI call-completion webhook.
 *
 * !! SIGNATURE VERIFICATION BELOW IS UNVERIFIED !!
 * Nothing here has been checked against Fathom's actual webhook docs
 * or dashboard, because neither was available while building this —
 * there's no confirmed field name for the signature header, and no
 * confirmation Fathom even signs its webhooks (a Zapier-bridged
 * integration, for instance, typically wouldn't). What's implemented
 * is the common HMAC-SHA256-over-raw-body pattern (Stripe/GitHub
 * style) read from an `x-fathom-signature` header, PLUS a plain
 * shared-secret fallback via `x-webhook-secret`, so this has the best
 * chance of working with whatever Fathom actually does — but confirm
 * against Fathom's real docs/dashboard before relying on it, and
 * update `isValidSignature()` below to match.
 *
 * If FATHOM_WEBHOOK_SECRET isn't set at all, verification is skipped
 * entirely (every request accepted) — fine for local testing with a
 * tool like ngrok, not fine for production. Set the env var before
 * deploying this for real.
 */

function isValidSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured — verification not possible, so not enforced

  const hmacHeader = headers.get("x-fathom-signature");
  if (hmacHeader) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const givenBuf = Buffer.from(hmacHeader, "utf8");
    if (expectedBuf.length !== givenBuf.length) return false;
    return timingSafeEqual(expectedBuf, givenBuf);
  }

  const sharedSecretHeader = headers.get("x-webhook-secret");
  if (sharedSecretHeader) {
    const expectedBuf = Buffer.from(secret, "utf8");
    const givenBuf = Buffer.from(sharedSecretHeader, "utf8");
    if (expectedBuf.length !== givenBuf.length) return false;
    return timingSafeEqual(expectedBuf, givenBuf);
  }

  // A secret is configured but the request carries neither header we
  // know how to check — reject rather than silently accept.
  return false;
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createAdminClient(); // no user session on an external webhook — service role, RLS bypassed deliberately here

  const callId: string =
    (typeof payload?.id === "string" && payload.id) ||
    (typeof payload?.call_id === "string" && payload.call_id) ||
    (typeof payload?.recording_id === "string" && payload.recording_id) ||
    (typeof payload?.meeting_id === "string" && payload.meeting_id) ||
    // No stable id anywhere we know to look — derive one from the
    // body so retries of the exact same payload are still
    // deduplicated, rather than generating a fresh random id (which
    // would let a webhook retry create a duplicate client).
    createHash("sha256").update(rawBody).digest("hex");

  // Idempotency: Fathom (like most webhook senders) may retry
  // delivery. If we've already fully processed this call, don't
  // create a second client/planner for it.
  const { data: existing } = await supabase
    .from("fathom_calls")
    .select("id, applied, client_id")
    .eq("fathom_call_id", callId)
    .maybeSingle();

  if (existing?.applied) {
    return NextResponse.json({ ok: true, status: "already processed", client_id: existing.client_id });
  }

  let fathomCallRowId = existing?.id ?? null;

  if (!fathomCallRowId) {
    const { data: inserted, error: insertError } = await supabase
      .from("fathom_calls")
      .insert({
        fathom_call_id: callId,
        raw_payload: payload,
        summary: typeof payload?.summary === "string" ? payload.summary : null,
        action_items: payload?.action_items ?? null,
        transcript_url: typeof payload?.transcript_url === "string" ? payload.transcript_url : null,
        received_at: new Date().toISOString(),
        applied: false,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("fathom-webhook: failed to insert fathom_calls row", insertError);
      return NextResponse.json({ error: "Failed to record call" }, { status: 500 });
    }
    fathomCallRowId = inserted.id;
  }

  let mapping;
  try {
    mapping = mapFathomToPlanner(payload);
  } catch (err) {
    // The call is safely recorded either way (above) — mapping
    // failure just means this shows up in /app/prospects as
    // "recorded but not yet turned into a prospect", for a human to
    // handle manually, rather than losing the call data.
    console.error("fathom-webhook: mapFathomToPlanner threw", err);
    return NextResponse.json({ error: "Recorded call, but mapping failed" }, { status: 500 });
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({
      name: mapping.client.name,
      contact_name: mapping.client.contact_name,
      contact_email: mapping.client.contact_email,
      stage: "lead",
      next_action: mapping.client.next_action,
    })
    .select("id")
    .single();

  if (clientError || !client) {
    console.error("fathom-webhook: failed to insert client", clientError);
    return NextResponse.json({ error: "Recorded call, but failed to create client" }, { status: 500 });
  }

  const { error: plannerError } = await supabase.from("planners").insert({
    client_id: client.id,
    content: mapping.plannerContent as any,
    status: "draft",
  });

  if (plannerError) {
    console.error("fathom-webhook: failed to insert planner", plannerError);
    return NextResponse.json({ error: "Created client, but failed to create planner" }, { status: 500 });
  }

  await supabase
    .from("fathom_calls")
    .update({ applied: true, client_id: client.id })
    .eq("id", fathomCallRowId);

  console.info("fathom-webhook: mapping notes for", callId, mapping.notes);

  return NextResponse.json({ ok: true, client_id: client.id });
}
