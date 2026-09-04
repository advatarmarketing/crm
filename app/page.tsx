import { redirect } from "next/navigation";

// Root just hands off to /login; middleware.ts takes it from there
// once a session exists (redirecting into the right /app/* home).
export default function RootPage() {
  redirect("/login");
}
