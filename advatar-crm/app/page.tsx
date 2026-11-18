import { redirect } from "next/navigation";

// Middleware sends anyone already signed in on this device straight
// to their own home; everyone else reaches this and goes to /login.
export default function RootPage() {
  redirect("/login");
}
