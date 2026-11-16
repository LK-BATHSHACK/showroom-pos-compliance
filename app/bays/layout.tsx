import { guardRole } from "@/lib/pageGuard";
import { BAY_VIEW_ROLES } from "@/lib/bays/access";
import { bayDbConfigured } from "@/lib/bays/db";
import BaysNotReady from "@/components/bays/BaysNotReady";

// Bay register (Round 28). Store Manager / Store Staff are further limited to
// their own store on every page and API route (lib/bays/access.ts).
// Round 30: until Supabase is connected, show a friendly notice instead of
// letting the pages throw (the hub showed "Application error" on 16 Nov).
export default async function BaysLayout({ children }: { children: React.ReactNode }) {
  await guardRole(BAY_VIEW_ROLES);
  if (!bayDbConfigured()) return <BaysNotReady reason="setup" />;
  return <>{children}</>;
}
