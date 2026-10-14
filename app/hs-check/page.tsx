import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { fetchSites } from "@/lib/hsSubmission";
import { getSiteChecks } from "@/lib/sites";
import HSWalkaroundForm from "@/components/HSWalkaroundForm";

export const dynamic = "force-dynamic";

export default async function HSWalkaroundPage() {
  const session = await requireRole(["Admin", "Marketing", "H&S", "Store Manager"]);
  if (!session) redirect("/login");

  // Only stores set up for the H&S check (Stores admin, Round 26) - e.g. a
  // store switched to POS-only no longer appears in the picker.
  const sites = (await fetchSites()).filter((s) => s.hsApplies);

  // Store Managers submit only for their assigned site - no picker, no
  // choice of a different site, enforced again server-side on submit.
  const lockedSite = session.role === "Store Manager" ? sites.find((s) => s.id === session.siteId) || null : null;

  if (session.role === "Store Manager" && !lockedSite) {
    // Their store doesn't do the H&S check (or is switched off). Send them
    // to the check it does do, rather than showing a picker of every site.
    const checks = await getSiteChecks(session.siteId);
    if (checks.pos) redirect("/pos-check");
    return (
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>H&S Check</h1>
        <p style={{ color: "#6E6E6E", marginTop: 0 }}>
          H&amp;S checks aren&apos;t set up for your store. If you think they should be, ask an Admin to switch them on.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>H&S Check</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Monthly Health &amp; Safety checklist. Questions shown are scoped to the site you pick - warehouse-only
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
