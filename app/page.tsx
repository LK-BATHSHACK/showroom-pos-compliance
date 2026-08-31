import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { homeForRole } from "@/lib/pageGuard";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(homeForRole(session.role));
}
