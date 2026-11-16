import { guardRole } from "@/lib/pageGuard";
import { BAY_VIEW_ROLES } from "@/lib/bays/access";

// Bay register (Round 28). Store Manager / Store Staff are further limited to
// their own store on every page and API route (lib/bays/access.ts).
export default async function BaysLayout({ children }: { children: React.ReactNode }) {
  await guardRole(BAY_VIEW_ROLES);
  return <>{children}</>;
}
