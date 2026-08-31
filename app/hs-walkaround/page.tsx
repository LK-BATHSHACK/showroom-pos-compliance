import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { fetchSites } from "@/lib/hsSubmission";
import HSWalkaroundForm from "@/components/HSWalkaroundForm";

export const dynamic = "force-dynamic";

export default async function HSWalkaroundPage() {
  const session = await requireRole(["Admin", "Marketing", "H&S", "Store Manager"]);
  if (!session) redirect("/login");

  const sites = await fetchSites();

  // Store Managers submit only for their assigned site - no picker, no
  // choice of a different site, enforced again server-side on submit.
  const lockedSite = session.role === "Store Manager" ? sites.find((s) => s.id === session.siteId) || null : null;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>H&S Walkaround</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Monthly Health & Safety Walkaround checklist. Questions shown are scoped to the site you pick - warehouse-only
        and site-specific questions only appear where they apply.
      </p>
      <HSWalkaroundForm
        sites={sites}
        lockedSite={lockedSite}
        submittedByName={session.name}
      />
    </div>
  );
}
