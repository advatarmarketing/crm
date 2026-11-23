import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { YouPicker } from "@/components/you/YouPicker";

export const dynamic = "force-dynamic";

export default async function YouPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role === "videographer") redirect("/app/my-clients/you");
  return <YouPicker supabase={supabase} isCeo={role === "ceo"} base="/app/clients" />;
}
