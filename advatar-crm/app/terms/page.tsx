import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · Advatar",
  description: "The terms for using the Advatar dashboard.",
};

export const dynamic = "force-static";

const CONTACT = "marketing@advatar.co.uk";

/**
 * The public Terms of Service, app.advatar.co.uk/terms.
 *
 * These cover the dashboard itself. The work we do for a client is
 * covered by that client's own agreement with us, which wins where the
 * two differ (see "Your agreement with us").
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="21 November 2026" other={{ href: "/privacy", label: "Privacy Policy" }}>
      <p>
        These terms cover your use of the Advatar dashboard at app.advatar.co.uk (&ldquo;the dashboard&rdquo;), run
        by Advatar (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By signing in, you agree to them.
      </p>

      <h2>Your agreement with us</h2>
      <p>
        The work we do for you, our fees and payment terms are set out in your proposal or contract with us. If
        anything in these terms conflicts with that agreement, the agreement wins.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>We create accounts for our clients, team members and videographers. Accounts are personal: please don&rsquo;t share your login.</li>
        <li>Keep your password safe, and tell us straight away if you think someone else has used your account.</li>
        <li>You are responsible for what is done through your account.</li>
      </ul>

      <h2>Using the dashboard</h2>
      <p>Please don&rsquo;t:</p>
      <ul>
        <li>try to see information that isn&rsquo;t yours, or get around how the dashboard limits access;</li>
        <li>upload anything unlawful, harmful, or that you don&rsquo;t have the right to share;</li>
        <li>upload viruses or anything designed to damage or overload the dashboard;</li>
        <li>copy, resell or reverse-engineer the dashboard.</li>
      </ul>
      <p>We may suspend an account that breaks these rules or puts the dashboard or other people at risk.</p>

      <h2>Your content</h2>
      <p>
        You keep ownership of the files, footage, logos and information you give us. You give us permission to use
        them to provide our services to you. You confirm you have the right to share them with us. Who owns the
        content we produce for you is set out in your agreement with us.
      </p>

      <h2>Social media numbers</h2>
      <p>
        To report on the accounts we run for you, we read their public numbers from their public profiles. We never
        post or change anything on your accounts through the dashboard. See our <Link href="/privacy">Privacy Policy</Link>{" "}
        for what we read and how we look after it.
      </p>

      <h2>Numbers and reports</h2>
      <p>
        Results shown in the dashboard come from the platforms&rsquo; public profiles and are shown as they appear there. They
        can be delayed, change later, or be unavailable when a platform has problems. We do our best to keep them
        accurate but can&rsquo;t guarantee they are complete or error-free.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep the dashboard running smoothly, but it may sometimes be unavailable for maintenance or for
        reasons outside our control. We may change or improve its features over time.
      </p>

      <h2>Our responsibility to you</h2>
      <p>
        Nothing in these terms limits our liability for death or personal injury caused by our negligence, for
        fraud, or for anything else that cannot be limited by law. Otherwise, we are not responsible for indirect
        losses or lost profits, and our total liability relating to the dashboard is limited to the fees you paid us
        in the 12 months before the claim. Your agreement with us may set out further terms.
      </p>

      <h2>Ending your access</h2>
      <p>
        Your access ends when our work together ends, or if you ask us to close your account. Before that, you can
        ask us for copies of your files. What happens to your information afterwards is explained in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. We will change the date at the top, and tell you if a change matters. Continuing
        to use the dashboard after that means you accept the new terms.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the law of England and Wales, and its courts deal with any disputes.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
