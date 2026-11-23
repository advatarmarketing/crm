import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { YouPicker } from "@/components/you/YouPicker";

export const dynamic = "force-dynamic";

/** YOU for a videographer the CEO has switched on (their client pages live under /app/my-clients). */
export default async function MyYouPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <YouPicker supabase={supabase} isCeo={false} base="/app/my-clients" />;
}
