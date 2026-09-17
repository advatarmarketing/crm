import { redirect } from "next/navigation";

/**
 * Guidelines became one half of Tools (prompt 4), which also carries
 * Resources. Kept as a redirect rather than deleted: this was in the
 * nav for weeks and people bookmark the tab they live in.
 */
export default function GuidelinesPage() {
  redirect("/app/tools");
}
