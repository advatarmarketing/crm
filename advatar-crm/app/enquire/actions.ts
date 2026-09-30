"use server";

import { createHash } from "crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import {
  describeAnswers,
  looksLikeEmail,
  looksLikePhone,
  type EnquiryFieldErrors,
  type EnquiryPayload,
  type EnquiryResult,
} from "@/lib/enquiry";

/** Who hears about a new enquiry. Overridable without a code change. */
const NOTIFY_EMAIL = process.env.ENQUIRY_NOTIFY_EMAIL?.trim() || "marketing@advatar.co.uk";

/** Per visitor: at most this many in an hour, and this many in a day. */
const MAX_PER_HOUR = 3;
const MAX_PER_DAY = 8;

/**
 * Mixed into the IP before hashing so the stored value is not a plain
 * hash of an address — there are only four billion IPv4 addresses, and
 * a bare SHA-256 of one can be reversed by trying them all. A constant
 * in the source rather than a secret: this only has to make the stored
 * rows useless to anyone reading the table, and a secret nobody has
 * set yet would be worse than a constant that is always there.
 */
const IP_SALT = "advatar-enquiry-v1";

function hashVisitor(): string {
  const h = headers();
  // Vercel sets x-forwarded-for; the first entry is the real client.
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(IP_SALT + ip).digest("hex");
}

/**
 * Takes an enquiry from the public /enquire page and turns it into a
 * lead.
 *
 * Runs on the server with the service-role key, because `clients` has
 * no insert policy for signed-out visitors and should not have one:
 * an open write policy on the clients table would let anyone on the
 * internet put rows in the CRM. Everything the browser sends is
 * checked again here — the checks in the page are there to be helpful,
 * not to be trusted.
 */
export async function submitEnquiry(payload: EnquiryPayload): Promise<EnquiryResult> {
  // ---------------------------------------------------------------
  // The honeypot
  // ---------------------------------------------------------------
  // A hidden field no person can see. Anything in it means a bot
  // filled the form in automatically. It gets "sent" and nothing is
  // saved: telling a bot it failed only teaches whoever wrote it to
  // try again differently.
  if (payload.hp.trim()) return { ok: true };

  // ---------------------------------------------------------------
  // What has to be there
  // ---------------------------------------------------------------
  const name = payload.name.trim();
  const business = payload.business.trim();
  const phone = payload.phone.trim();
  const email = payload.email.trim();

  const fields: EnquiryFieldErrors = {};
  if (!name) fields.name = "Please tell us your name.";
  if (!business) fields.business = "Please tell us your business name.";
  if (!phone) fields.phone = "Please leave a number we can reach you on.";
  else if (!looksLikePhone(phone)) fields.phone = "That doesn't look like a phone number.";
  if (email && !looksLikeEmail(email)) fields.email = "That doesn't look like an email address.";

  if (Object.keys(fields).length > 0) {
    return { ok: false, message: "Just a couple of things to fix.", fields };
  }

  const admin = createAdminClient();
  const visitor = hashVisitor();

  // ---------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------
  // Fails OPEN: if the throttle table is unreachable — 0033 not run
  // yet, or the database having a bad moment — a real enquiry still
  // gets through. Losing genuine work to protect against a hypothetical
  // flood is the wrong way round.
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();

  const { data: recent, error: throttleError } = await admin
    .from("enquiry_throttle")
    .select("created_at")
    .eq("ip_hash", visitor)
    .gte("created_at", dayAgo);

  if (!throttleError) {
    const rows = (recent ?? []) as { created_at: string }[];
    const inHour = rows.filter((r) => r.created_at >= hourAgo).length;

    if (inHour >= MAX_PER_HOUR || rows.length >= MAX_PER_DAY) {
      return {
        ok: false,
        message:
          "We've already got an enquiry from you. Give us a little time to come back to you — or ring us if it's urgent.",
      };
    }
  }

  // ---------------------------------------------------------------
  // The lead
  // ---------------------------------------------------------------
  const answers = describeAnswers(payload);

  // Two days out, because the page promises a reply within 48 hours.
  // The Leads board sorts on this and the dashboard counts what is
  // overdue, so the promise shows up as work rather than as good
  // intentions.
  const followUp = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const lead = {
    name: business,
    contact_name: name,
    contact_email: email || null,
    contact_phone: phone,
    stage: "lead" as const,
    lead_source: "Website enquiry",
    next_action: "Reply to website enquiry and book a discovery call",
    follow_up_date: followUp,
    notes: answers,
  };

  const { data: inserted, error } = await admin.from("clients").insert(lead).select("id").single();

  let leadId = (inserted as { id: string } | null)?.id ?? null;

  if (error) {
    // "That column does not exist" — 0033 has not been run, so there
    // is nowhere to put the phone number yet. Rather than lose the
    // enquiry, save it without that column and keep the number in the
    // notes, where it is still the first thing you read.
    //
    // Two codes because two things can answer: 42703 is Postgres's own
    // "undefined column", PGRST204 is PostgREST refusing before it
    // asks, because the column is not in its cached copy of the
    // schema. Handling only the first would have made this whole
    // safety net do nothing, since PostgREST is what the app talks to.
    if (error.code === "42703" || error.code === "PGRST204") {
      const { contact_phone, notes, ...rest } = lead;
      const { data: retry, error: retryError } = await admin
        .from("clients")
        .insert({ ...rest, notes: `Phone: ${phone}\n\n${notes}` })
        .select("id")
        .single();

      if (retryError) return { ok: false, message: sorry(retryError.message) };
      leadId = (retry as { id: string } | null)?.id ?? null;
    } else {
      return { ok: false, message: sorry(error.message) };
    }
  }

  // ---------------------------------------------------------------
  // Everything below here is after the fact
  // ---------------------------------------------------------------
  // The enquiry is saved. Nothing from this point may turn a saved
  // enquiry into an error message on the visitor's screen — if the
  // email provider is down, that is ours to notice, not theirs.

  await recordSend(admin, visitor);
  await tellTheTeam({ admin, leadId, business, name, phone, email, answers });

  return { ok: true };
}

function sorry(detail: string): string {
  return `Something went wrong sending that — please try again, or email ${NOTIFY_EMAIL}. (${detail})`;
}

/** Notes the send, and clears out anything older than a day. */
async function recordSend(admin: ReturnType<typeof createAdminClient>, visitor: string) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from("enquiry_throttle").insert({ ip_hash: visitor });
  await admin.from("enquiry_throttle").delete().lt("created_at", dayAgo);
}

/**
 * Two ways, because either can be switched off without anyone
 * noticing until a lead has gone cold:
 *
 *   - an email to marketing@advatar.co.uk, which needs RESEND_API_KEY
 *     and EMAIL_FROM set in Vercel;
 *   - a notification for every CEO account, which needs nothing and
 *     shows in the bell. That row is also queued for email, so if the
 *     provider is configured later the CEO gets written to as well.
 */
async function tellTheTeam({
  admin,
  leadId,
  business,
  name,
  phone,
  email,
  answers,
}: {
  admin: ReturnType<typeof createAdminClient>;
  leadId: string | null;
  business: string;
  name: string;
  phone: string;
  email: string;
  answers: string;
}) {
  const base = siteUrl();
  const href = leadId ? `/app/clients/${leadId}` : "/app/leads";
  const title = `New website enquiry: ${business}`;
  const body = `${name} · ${phone}${email ? ` · ${email}` : ""}\n\n${answers}`;

  await sendEmail({
    to: NOTIFY_EMAIL,
    subject: title,
    text: body,
    actionUrl: base ? `${base}${href}` : undefined,
    actionLabel: "Open the lead",
  });

  const { data: ceos } = await admin.from("profiles").select("id").eq("role", "ceo");

  const rows = ((ceos ?? []) as { id: string }[]).map((c) => ({
    user_id: c.id,
    kind: "website_enquiry",
    title,
    // The bell shows a line, not a page. The whole thing is on the lead.
    body: `${name} · ${phone}`,
    href,
    email_pending: true,
  }));

  if (rows.length > 0) await admin.from("notifications").insert(rows);
}
