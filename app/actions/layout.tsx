import { guardRole } from "@/lib/pageGuard";

// H&S added 9 Sep 2026 (Lorraine: "all the H&S logins need to be able to
// see the mark resolved and manage the h&s side") - this layout (not
// app/actions/page.tsx, which had no guard of its own) was the actual
// enforcement point excluding H&S from the Actions Tracker; the nav link
// and the API route that resolves an action already allowed H&S, this was
// the one place still excluding them.
export default async function ActionsLayout({ children }: { children: React.ReactNode }) {
  await guardRole(["Admin", "Marketing", "H&S"]);
  return <>{children}</>;
}
