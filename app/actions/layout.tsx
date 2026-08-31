import { guardRole } from "@/lib/pageGuard";

export default async function ActionsLayout({ children }: { children: React.ReactNode }) {
  await guardRole(["Admin", "Marketing"]);
  return <>{children}</>;
}
