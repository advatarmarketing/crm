import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailIsConfigured, sendEmail } from "@/lib/email";
import { type Choice, type ProposalContent } from "./content";
import { cleanChoice, contractText, money, slidesFor, totals } from "./pricing";

/**
 * Proposals (0057), server side, for the client's link. The link is
 * not signed in, so everything here reads and writes with the service
 * key, and only ever by the proposal's long random code. Nothing a
 * page sends is trusted: the package, extras and plan are cleaned
 * against the saved proposal and every price is recalculated.
 */

export interface PublicProposal {
  id: string;
  dealId: string;
  version: number;
  code: string;
  status: string;
  content: ProposalContent;
  choice: Choice | null;
  amount: number | null;
  acceptedEmail: string | null;
  acceptedAt: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  paymentMethod: "card" | "cash" | null;
  supersededBy: string | null;
  createdBy: string | null;
  deal: { business: string; contact: string | null; email: string | null; clientId: string | null; ownerId: string | null };
}

const COLUMNS =
  "id, deal_id, version, code, status, content, choice, amount, accepted_email, accepted_at, invoice_number, paid_at, payment_method, superseded_by, created_by, client_id, login_profile_id, stripe_subscription_id, first_opened_at, finished_at, proposal_deals(business_name, contact_name, email, client_id, owner_id)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shape(row: any): PublicProposal {
  const d = row.proposal_deals ?? {};
  return {
    id: row.id,
    dealId: row.deal_id,
    version: row.version,
    code: row.code,
    status: row.status,
    content: row.content,
    choice: row.choice ?? null,
    amount: row.amount === null ? null : Number(row.amount),
    acceptedEmail: row.accepted_email,
    acceptedAt: row.accepted_at,
    invoiceNumber: row.invoice_number,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    supersededBy: row.superseded_by,
    createdBy: row.created_by,
    deal: { business: d.business_name ?? "", contact: d.contact_name ?? null, email: d.email ?? null, clientId: d.client_id ?? null, ownerId: d.owner_id ?? null },
  };
}

/** A code is 64 hex characters. Anything else is turned away before the database. */
export function validCode(code: string) {
  return /^[a-f0-9]{64}$/.test(code);
}

export async function loadByCode(code: string): Promise<PublicProposal | null> {
  if (!validCode(code)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("proposals").select(COLUMNS).eq("code", code).maybeSingle();
  return data ? shape(data) : null;
}

export async function loadById(id: string): Promise<PublicProposal | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("proposals").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? shape(data) : null;
}

/** The newest version of this deal that has been sent, if it's newer than this one. */
export async function newerSentVersion(p: PublicProposal): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("proposals")
    .select("code, version, status")
    .eq("deal_id", p.dealId)
    .gt("version", p.version)
    .neq("status", "draft")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { code: string } | null)?.code ?? null;
}

/** Can the client use this link right now (as opposed to seeing a status page)? */
export function linkOpen(p: PublicProposal) {
  return p.status === "sent" || p.status === "awaiting_payment" || p.status === "awaiting_cash";
}

// -----------------------------------------------------------------
// Tracking
// -----------------------------------------------------------------

export interface TrackEvent {
  kind: "open" | "slide" | "package" | "breakdown" | "extra" | "plan" | "contract" | "lets_go" | "email" | "method";
  slide?: string | null;
  package?: string | null;
  ms?: number | null;
  detail?: Record<string, unknown> | null;
}

const MAX_EVENTS_PER_PROPOSAL = 20000;

export async function recordEvents(code: string, session: string, events: TrackEvent[]): Promise<void> {
  const p = await loadByCode(code);
  if (!p || p.status === "draft" || p.status === "superseded" || !events.length) return;
  const admin = createAdminClient();
  const { count } = await admin.from("proposal_events").select("id", { count: "exact", head: true }).eq("proposal_id", p.id);
  if ((count ?? 0) > MAX_EVENTS_PER_PROPOSAL) return;
  await admin.from("proposal_events").insert(
    events.map((e) => ({
      proposal_id: p.id,
      session_id: session.slice(0, 64),
      kind: e.kind,
      slide: e.slide?.slice(0, 60) ?? null,
      package: e.package?.slice(0, 30) ?? null,
      ms: e.ms == null ? null : Math.min(Math.max(Math.round(e.ms), 0), 3600000),
      detail: e.detail ?? null,
    }))
  );

  const now = new Date().toISOString();
  const label = p.deal.business || "A prospect";
  if (events.some((e) => e.kind === "open") && !(await already(p.id, "first_opened_at"))) {
    await admin.from("proposals").update({ first_opened_at: now }).eq("id", p.id).is("first_opened_at", null);
    await notifyTeam(p, `${label} opened their proposal`, `Version ${p.version}. You'll see what they look at on the deal.`, false);
  }
  if (events.some((e) => e.kind === "slide" && e.slide === "summary") && !(await already(p.id, "finished_at"))) {
    await admin.from("proposals").update({ finished_at: now }).eq("id", p.id).is("finished_at", null);
    await notifyTeam(p, `${label} went through their whole proposal`, "They reached the final page.", false);
  }
}

async function already(id: string, column: "first_opened_at" | "finished_at") {
  const admin = createAdminClient();
  const { data } = await admin.from("proposals").select(column).eq("id", id).maybeSingle();
  return Boolean((data as Record<string, string | null> | null)?.[column]);
}

/** Every slide of the package has been looked at (in any visit). */
export async function hasSeenEverything(p: PublicProposal, pkg: Choice["package"]): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("proposal_events").select("slide").eq("proposal_id", p.id).eq("kind", "slide");
  const seen = new Set(((data ?? []) as { slide: string | null }[]).map((r) => r.slide));
  return slidesFor(p.content, pkg)
    .map((s) => s.id)
    .filter((id) => !seen.has(id));
}

// -----------------------------------------------------------------
// Notifications to the team
// -----------------------------------------------------------------

async function notifyTeam(p: PublicProposal, title: string, body: string, email: boolean, includeOps = false) {
  const admin = createAdminClient();
  const { data: bosses } = await admin
    .from("profiles")
    .select("id, role")
    .in("role", includeOps ? ["ceo", "operations_manager"] : ["ceo"]);
  const ids = new Set<string>(((bosses ?? []) as { id: string }[]).map((b) => b.id));
  if (p.deal.ownerId) ids.add(p.deal.ownerId);
  if (!ids.size) return;
  await admin.from("notifications").insert(
    [...ids].map((user_id) => ({
      user_id,
      kind: "proposal",
      title,
      body,
      href: `/app/prospects/deals/${p.dealId}`,
      email_pending: email,
    }))
  );
}

// -----------------------------------------------------------------
// Accepting: the email step
// -----------------------------------------------------------------

function invoiceNumber(p: PublicProposal) {
  const d = new Date();
  return `ADV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${p.code.slice(0, 6).toUpperCase()}`;
}

export async function accept(
  p: PublicProposal,
  rawChoice: unknown,
  rawEmail: string,
  meta: { ip: string | null; userAgent: string | null; origin: string }
): Promise<{ ok: true; amount: number; plan: Choice["plan"]; invoiceNumber: string; emailed: boolean } | { ok: false; error: string }> {
  if (!linkOpen(p)) return { ok: false, error: "This proposal can't be accepted any more." };
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return { ok: false, error: "Please enter a valid email address." };

  const choice = cleanChoice(p.content, rawChoice as Partial<Choice>);
  const missing = await hasSeenEverything(p, choice.package);
  if (missing.length) return { ok: false, error: "Please go through every page of the proposal first." };

  const t = totals(p.content, choice);
  const who = { business: p.deal.business, contact: p.deal.contact, email };
  const contract = contractText(p.content, choice, who);
  const number = p.invoiceNumber ?? invoiceNumber(p);
  const pkgName = p.content.packages.find((x) => x.id === choice.package)?.name ?? choice.package;

  const admin = createAdminClient();
  const { error: accErr } = await admin.from("proposal_acceptances").insert({
    proposal_id: p.id,
    contact_name: p.deal.contact,
    business_name: p.deal.business,
    email,
    package: choice.package,
    plan: choice.plan,
    extras: choice.extras,
    monthly: t.monthly,
    total: t.dueNow,
    contract_text: contract,
    ip: meta.ip?.slice(0, 100) ?? null,
    user_agent: meta.userAgent?.slice(0, 400) ?? null,
  });
  if (accErr) return { ok: false, error: "Something went wrong saving that. Please try again." };

  await admin
    .from("proposals")
    .update({
      choice,
      accepted_email: email,
      accepted_at: new Date().toISOString(),
      amount: t.dueNow,
      invoice_number: number,
      status: p.status === "awaiting_cash" ? "awaiting_cash" : "awaiting_payment",
    })
    .eq("id", p.id);
  if (!p.deal.email) await admin.from("proposal_deals").update({ email }).eq("id", p.dealId);

  // The proposal, contract and invoice, by email.
  const base = `${meta.origin}/proposal/${p.code}`;
  const greeting = p.deal.contact ? `Hi ${p.deal.contact.split(/\s+/)[0]},` : "Hi,";
  const text = [
    greeting,
    "",
    `Thank you for choosing Advatar. Here's a summary of the ${pkgName} package for ${p.deal.business}:`,
    "",
    ...t.slides.map((s) => `- ${s.slide.title}: ${money(s.subtotal)} a month`),
    "",
    choice.plan === "upfront"
      ? `3 months upfront: ${money(t.upfront)} (you save ${money(t.upfrontSaving)}).`
      : `Monthly: ${money(t.monthly)} a month.`,
    t.budgetTotal > 0 ? `Suggested ad budget: ${money(t.budgetTotal)} a month, paid by you directly to the ad platforms.` : "",
    "",
    `Invoice ${number}: ${money(t.dueNow)} due now.`,
    `Your invoice: ${base}/invoice`,
    `Your contract: ${base}/contract`,
    `Your proposal: ${base}`,
    "",
    "Advatar",
  ]
    .filter((l) => l !== null)
    .join("\n");
  let emailed = false;
  let problem: string | null = null;
  if (emailIsConfigured()) {
    const r = await sendEmail({ to: email, subject: `Your Advatar proposal, contract and invoice ${number}`, text, actionUrl: `${base}/invoice`, actionLabel: "View your invoice" });
    emailed = r.sent;
    if (!r.sent) problem = r.reason === "failed" ? `The email didn't send: ${r.detail}` : "Email isn't set up in the CRM.";
  } else {
    problem = "Email isn't set up in the CRM, so the client wasn't emailed their contract and invoice. Send them the links from the deal page.";
  }
  await admin.from("proposals").update({ emailed_at: emailed ? new Date().toISOString() : null, email_problem: problem }).eq("id", p.id);
  await notifyTeam(p, `${p.deal.business || "A prospect"} accepted their proposal`, `${pkgName}, ${choice.plan === "upfront" ? "3 months upfront" : "monthly"}: ${money(t.dueNow)}. Next: choosing how to pay.`, true);

  return { ok: true, amount: t.dueNow, plan: choice.plan, invoiceNumber: number, emailed };
}

export async function chooseCash(p: PublicProposal): Promise<{ ok: boolean; error?: string }> {
  if (!p.acceptedAt || !linkOpen(p)) return { ok: false, error: "Please accept the proposal first." };
  const admin = createAdminClient();
  await admin.from("proposals").update({ status: "awaiting_cash", payment_method: "cash" }).eq("id", p.id);
  await notifyTeam(p, `${p.deal.business || "A prospect"} will pay cash`, `Collect ${money(p.amount ?? 0)}, then press "Cash received" on the deal.`, true, true);
  return { ok: true };
}

export async function saveCheckout(p: PublicProposal, sessionId: string) {
  const admin = createAdminClient();
  await admin.from("proposals").update({ stripe_session_id: sessionId, status: "awaiting_payment", payment_method: "card" }).eq("id", p.id);
}

// -----------------------------------------------------------------
// Paid: make (or update) the client, their login, the invoice
// -----------------------------------------------------------------

function tempPassword() {
  const words = ["Studio", "Frame", "Lens", "Focus", "Reel", "Scene", "Light", "Sound"];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 9999)}-${crypto.randomBytes(3).toString("hex")}`;
}

/** Card: called from the Stripe webhook. Safe to call more than once. */
export async function cardPaid(proposalId: string, ref: string, amountPence: number, subscriptionId: string | null, origin: string) {
  const admin = createAdminClient();
  const p = await loadById(proposalId);
  if (!p) return;
  const { error } = await admin.from("proposal_payments").insert({ proposal_id: p.id, method: "card", amount: amountPence / 100, kind: "first", stripe_ref: ref });
  // A repeat of the same webhook: the payment is already there, but
  // carry on in case setting the client up stopped half way last time.
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  await admin
    .from("proposals")
    .update({ status: "paid", paid_at: p.paidAt ?? new Date().toISOString(), payment_method: "card", stripe_subscription_id: subscriptionId ?? undefined })
    .eq("id", p.id);
  await admin.from("proposal_deals").update({ status: "won" }).eq("id", p.dealId);
  await onboard(p.id, origin);
}

/** A later monthly card payment on a subscription. */
export async function monthlyCardPaid(subscriptionId: string, ref: string, amountPence: number) {
  const admin = createAdminClient();
  const { data } = await admin.from("proposals").select("id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (!data) return;
  await admin.from("proposal_payments").insert({ proposal_id: (data as { id: string }).id, method: "card", amount: amountPence / 100, kind: "monthly", stripe_ref: ref });
}

/**
 * Turns a paid proposal into a client: the client record (or the
 * existing one updated), a paid invoice, their login and a welcome
 * email, and a note to the CEO to give them a team. Every step checks
 * whether it's already been done.
 */
export async function onboard(proposalId: string, origin: string): Promise<{ loginCreated: boolean; loginProblem: string | null }> {
  const admin = createAdminClient();
  const p = await loadById(proposalId);
  if (!p || !p.paidAt || !p.choice) return { loginCreated: false, loginProblem: "Not paid yet." };
  const t = totals(p.content, p.choice);
  const pkgName = p.content.packages.find((x) => x.id === p.choice!.package)?.name ?? p.choice.package;
  const service = `${pkgName} package`;
  const email = p.acceptedEmail ?? p.deal.email;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await admin.from("proposals").select("client_id, login_profile_id").eq("id", p.id).maybeSingle() as any;
  let clientId: string | null = row?.client_id ?? null;
  const existing = Boolean(p.deal.clientId);
  // Only the first run announces it; repeats (a retried webhook, a
  // monthly cash payment) stay quiet.
  const fresh = !clientId;

  if (!clientId) {
    if (existing) {
      clientId = p.deal.clientId;
      await admin.from("clients").update({ stage: "active", service }).eq("id", clientId);
    } else {
      const { data: made, error } = await admin
        .from("clients")
        .insert({
          name: p.deal.business,
          contact_name: p.deal.contact,
          contact_email: email,
          stage: "active",
          service,
          from_proposal_id: p.id,
        })
        .select("id")
        .single();
      if (error || !made) throw new Error(error?.message ?? "Couldn't create the client.");
      clientId = (made as { id: string }).id;
    }
    await admin.from("proposals").update({ client_id: clientId }).eq("id", p.id);
  }

  // The paid invoice, once.
  if (p.invoiceNumber) {
    const { data: inv } = await admin.from("invoices").select("id").eq("client_id", clientId).eq("number", p.invoiceNumber).maybeSingle();
    if (!inv) {
      await admin.from("invoices").insert({
        client_id: clientId,
        number: p.invoiceNumber,
        service: `${service}, ${p.choice.plan === "upfront" ? "3 months upfront" : "first month"}`,
        amount: p.amount ?? t.dueNow,
        invoice_date: new Date().toISOString().slice(0, 10),
        status: "paid",
        paid_at: p.paidAt,
      });
    }
  }
  // What they pay (client_finance, CEO only). Monthly either way: the
  // 3-month upfront payment is a paid invoice, the agreement is monthly.
  await admin.from("client_finance").upsert(
    {
      client_id: clientId,
      billing_amount: t.monthly,
      billing_frequency: "monthly",
      billing_notes: `From proposal: ${service}${p.choice.plan === "upfront" ? `, first 3 months paid upfront (${money(p.amount ?? t.upfront)})` : ""}.`,
    },
    { onConflict: "client_id" }
  );

  // Their login: new clients only, and only once.
  let loginCreated = false;
  let loginProblem: string | null = null;
  let password: string | null = null;
  if (!existing && !row?.login_profile_id && email) {
    password = tempPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: p.deal.contact || p.deal.business },
    });
    if (error || !created?.user) {
      loginProblem = /already|registered|exists/i.test(error?.message ?? "")
        ? "There's already a login with this email, so a new one wasn't made. Link it to the client from Logins."
        : error?.message ?? "The login couldn't be made.";
      password = null;
    } else {
      const { error: profErr } = await admin
        .from("profiles")
        .update({ role: "client", full_name: p.deal.contact || p.deal.business, client_id: clientId })
        .eq("id", created.user.id);
      if (profErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        loginProblem = `The login couldn't be set up: ${profErr.message}`;
        password = null;
      } else {
        await admin.from("proposals").update({ login_profile_id: created.user.id }).eq("id", p.id);
        loginCreated = true;
      }
    }
  }

  // Welcome email with their login, if email is set up. Otherwise the
  // team hands the details over from the deal page.
  if (loginCreated && password && email) {
    if (emailIsConfigured()) {
      const r = await sendEmail({
        to: email,
        subject: "Welcome to Advatar: your login",
        text: [
          p.deal.contact ? `Hi ${p.deal.contact.split(/\s+/)[0]},` : "Hi,",
          "",
          "Payment received. Welcome to Advatar!",
          "",
          "Your client dashboard is where you'll see your plan, your videos and your results.",
          `Email: ${email}`,
          `Temporary password: ${password}`,
          "",
          "Please change your password after signing in (Settings, Password).",
          "We'll be in touch shortly to book your first shoot.",
        ].join("\n"),
        actionUrl: `${origin}/login`,
        actionLabel: "Sign in",
      });
      if (!r.sent) loginProblem = "The login was made but the welcome email didn't send. Use \"Get login details\" on the deal.";
    } else {
      loginProblem = "The login was made. Email isn't set up, so use \"Get login details\" on the deal to hand it over.";
    }
  }
  if (loginProblem) await admin.from("proposals").update({ email_problem: loginProblem }).eq("id", p.id);

  if (!fresh) return { loginCreated, loginProblem };
  if (!existing) {
    await notifyTeam(p, `${p.deal.business} paid: give them a team`, `${service}, ${money(p.amount ?? t.dueNow)} ${p.paymentMethod === "cash" ? "in cash" : "by card"}. They're on Prospects under "Needs a team".`, true, true);
  } else {
    await notifyTeam(p, `${p.deal.business} paid for their new deal`, `${service}, ${money(p.amount ?? t.dueNow)}.`, true, true);
  }
  return { loginCreated, loginProblem };
}

export async function resetClientLogin(profileId: string): Promise<{ ok: true; password: string; email: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.updateUserById(profileId, { password });
  if (error || !data?.user) return { ok: false, error: error?.message ?? "Couldn't reset the password." };
  return { ok: true, password, email: data.user.email ?? "" };
}
