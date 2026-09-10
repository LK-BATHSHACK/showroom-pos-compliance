import { guardRole } from "@/lib/pageGuard";

export default async function ConsumablesLayout({ children }: { children: React.ReactNode }) {
  await guardRole(["Admin", "Marketing", "Operations", "Store Manager"]);
  return <>{children}</>;
}
