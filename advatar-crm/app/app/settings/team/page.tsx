import { redirect } from "next/navigation";

/**
 * The team screen became /app/settings/logins, which does everything
 * this page did (inviting people, naming them) plus client portal
 * logins and password resets. Kept as a redirect so any bookmark or
 * link to the old address still lands somewhere useful.
 */
export default function TeamSettingsPage() {
  redirect("/app/settings/logins");
}
