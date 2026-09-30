import type { Metadata } from "next";
import { EnquiryFlow } from "./EnquiryFlow";

/**
 * The public enquiry page: app.advatar.co.uk/enquire
 *
 * No login. middleware.ts only guards "/app/:path*", so this sits
 * outside it — deliberately, since the people this page is for do not
 * have an account and are deciding whether they ever want one.
 *
 * It is also the page the main advatar.co.uk website links to, so its
 * address is part of the brochure now and should not be renamed
 * casually.
 */
export const metadata: Metadata = {
  title: "Work with Advatar",
  description: "Tell us what you're looking for and we'll be in touch within 48 hours.",
};

export default function EnquirePage() {
  return <EnquiryFlow />;
}
