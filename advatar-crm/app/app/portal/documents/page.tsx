import { redirect } from "next/navigation";

// The client's Documents tab has gone: everything it showed now sits in
// Files, in the section it belongs to. Old links and bookmarks land
// there instead of on a missing page.
export default function PortalDocumentsPage() {
  redirect("/app/portal/uploads");
}
