import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · Advatar",
  description: "How Advatar collects, uses and protects personal information.",
};

export const dynamic = "force-static";

const CONTACT = "marketing@advatar.co.uk";

/**
 * The public Privacy Policy, app.advatar.co.uk/privacy.
 *
 * Meta and TikTok both ask for this address when setting up the apps
 * behind the Content Hub. The #delete section is also what Meta's
 * "Data deletion instructions URL" points at.
 *
 * If the app starts using a new outside service that sees personal
 * information, add it under "Who we share it with".
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="21 November 2026" other={{ href: "/terms", label: "Terms of Service" }}>
      <p>
        This policy explains how Advatar (&ldquo;we&rdquo;, &ldquo;us&rdquo;) handles personal information in the
        Advatar dashboard at app.advatar.co.uk, which our clients, team members and videographers use, and on our
        enquiry page. We are the controller of this information under UK data protection law (the UK GDPR and the
        Data Protection Act 2018).
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, phone number, profile photo and the password
          you sign in with (stored only in scrambled, one-way form).
        </li>
        <li>
          <strong>Business and project details:</strong> information about your business, content plans, video
          schedules, notes, messages, feedback and to-do items you or we add to the dashboard.
        </li>
        <li>
          <strong>Files:</strong> logos, footage, videos, invoices, proposals and contracts uploaded by you or by us.
        </li>
        <li>
          <strong>Billing details:</strong> invoices and payment records. Card details are handled by our payment
          provider and never stored by us.
        </li>
        <li>
          <strong>Enquiries:</strong> what you tell us on the enquiry form, such as your name, contact details and
          what you are looking for.
        </li>
        <li>
          <strong>Social media accounts:</strong> see the next section.
        </li>
        <li>
          <strong>Technical information:</strong> the cookies needed to keep you signed in, and standard server
          logs such as IP address and browser type, kept for security.
        </li>
      </ul>

      <h2>Facebook, Instagram and TikTok</h2>
      <p>
        If you, or we on your behalf, connect a Facebook Page, Instagram business account or TikTok account to the
        dashboard, we read from that account:
      </p>
      <ul>
        <li>its name, username, profile picture and follower count;</li>
        <li>its posts and videos, with their captions, links, thumbnails and dates;</li>
        <li>the numbers for those posts: views, likes, comments and shares.</li>
      </ul>
      <p>
        We may also read the public numbers of an Instagram business or creator account from its public profile,
        through Advatar&rsquo;s own Instagram account.
      </p>
      <p>
        We use this only to show you, and our team working on your account, how your content is performing. We
        only ever read; we never post, comment, send messages or change anything on your accounts. We do not sell
        this data, use it for advertising, or share it with anyone else except the service providers listed below.
        The access keys the platforms give us are stored encrypted and are only used by our servers.
      </p>
      <p>
        Our use of information received from Meta and TikTok follows their platform terms and developer policies.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>
          <strong>To provide our services to you</strong> under our agreement with you: planning, filming, editing
          and posting content, sharing files, and reporting results.
        </li>
        <li>
          <strong>For our legitimate interests:</strong> running and securing the dashboard, answering enquiries,
          and improving how we work.
        </li>
        <li>
          <strong>To meet legal obligations</strong>, such as keeping financial records.
        </li>
        <li>
          <strong>With your consent</strong>, where you connect a social media account. You can withdraw this at
          any time (see below).
        </li>
      </ul>

      <h2>Who we share it with</h2>
      <p>We use trusted service providers who process information for us, under contract, and only as we instruct:</p>
      <ul>
        <li>Supabase, for our database, sign-in and file storage;</li>
        <li>Vercel, which hosts the dashboard;</li>
        <li>Resend, which sends our emails;</li>
        <li>Stripe, for payments;</li>
        <li>Anthropic, whose AI reads documents and screenshots we upload so we don&rsquo;t have to type them out;</li>
        <li>Fathom, which records and summarises meetings we hold with you;</li>
        <li>Meta, TikTok and Google (YouTube), when we read numbers from accounts connected to them.</li>
      </ul>
      <p>
        Some of these providers store information outside the UK. Where they do, the transfer is protected by
        safeguards recognised under UK law, such as the UK International Data Transfer Addendum or an adequacy
        decision.
      </p>
      <p>We never sell personal information. We will share it with others only if the law requires us to.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your information while we work together, and for up to six years afterwards for accounting and
        legal reasons. When a social media account is disconnected, we delete its access key straight away and
        stop reading it. The numbers already collected stay in your dashboard as history until our work together
        ends or you ask us to delete them, which we do within 30 days.
      </p>

      <h2>How we protect it</h2>
      <p>
        The dashboard is only available over an encrypted connection (HTTPS). Each person can only see what their
        role allows: clients only ever see their own business. Passwords are never stored in readable form, and
        social media access keys are encrypted. Access to the systems behind the dashboard is limited to the people
        who need it.
      </p>

      <h2 id="delete">Disconnecting an account and deleting your data</h2>
      <p>To stop us reading a Facebook, Instagram or TikTok account, you can do any of these:</p>
      <ul>
        <li>In the dashboard, open Content Hub and press Disconnect on that account.</li>
        <li>
          On Facebook, go to Settings &amp; privacy &rarr; Settings &rarr; Business integrations, and remove
          &ldquo;Advatar Dashboard&rdquo;.
        </li>
        <li>On TikTok, go to Settings and privacy &rarr; Security &rarr; Apps and services, and remove it there.</li>
      </ul>
      <p>
        To have the data we hold deleted, social media data or anything else, email{" "}
        <a href={`mailto:${CONTACT}?subject=Delete%20my%20data`}>{CONTACT}</a> with the subject &ldquo;Delete my
        data&rdquo; from the email address on your account. We will confirm within 30 days. We may keep a small
        amount of information where the law requires us to, such as invoices.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the right to ask for a copy of your information, to have it corrected or deleted, to restrict or
        object to how we use it, to receive it in a portable format, and to withdraw consent at any time. To do
        any of these, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will reply within one month.
      </p>
      <p>
        If you are unhappy with how we have handled your information, please tell us first. You can also complain
        to the Information Commissioner&rsquo;s Office at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer" target="_blank">
          ico.org.uk
        </a>{" "}
        or on 0303 123 1113.
      </p>

      <h2>Children</h2>
      <p>The dashboard is for businesses and is not meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we will update this page and the date at the top. If a change matters, we will
        tell you in the dashboard or by email.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or your information: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
