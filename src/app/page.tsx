import { redirect } from "next/navigation";

export default function Home() {
  // The (app) layout sends signed-out visitors on to /login.
  redirect("/dashboard");
}
