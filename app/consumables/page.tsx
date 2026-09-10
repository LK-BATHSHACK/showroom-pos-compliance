import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { fetchSites } from "@/lib/hsSubmission";
import { fetchConsumableCatalog, fetchConsumablesRequests } from "@/lib/consumables";
import ConsumablesRequestForm from "@/components/ConsumablesRequestForm";
import ConsumablesHistoryTable from "@/components/ConsumablesHistoryTable";
import ConsumablesDashboard from "@/components/ConsumablesDashboard";
import ConsumablesTabs from "@/components/ConsumablesTabs";

export const dynamic = "force-dynamic";

export default async function ConsumablesPage() {
  const session = await requireRole(["Admin", "Marketing", "Operations", "Store Manager"]);
  if (!session) redirect("/login");

  const [sites, catalog, requests] = await Promise.all([
    fetchSites(),
    fetchConsumableCatalog(),
    fetchConsumablesRequests(),
  ]);

  const lockedSite = session.role === "Store Manager" ? sites.find((s) => s.id === session.siteId) || null : null;

  const tabs: { key: string; label: string; content: React.ReactNode }[] = [];

  // Store Manager and Admin/Marketing get "Request" (Operations/Chris never
  // needs to submit one, he only fulfils them).
  if (session.role === "Store Manager" || session.role === "Admin" || session.role === "Marketing") {
    const requestContent = (
      <div>
        <ConsumablesRequestForm sites={sites} lockedSite={lockedSite} catalog={catalog} />
        {session.role === "Store Manager" && (
          <div style={{ height: 24 }}>
            <div style={{ height: 20 }} />
            <ConsumablesHistoryTable rows={requests.filter((r) => r.siteId === session.siteId)} />
          </div>
        )}
      </div>
    );
    tabs.push({ key: "Request", label: "Submit a Request", content: requestContent });
  }

  // Admin/Marketing/Operations get the cross-store reporting dashboard.
  // Only Admin/Operations can move a request's status along - Marketing is
  // view-only here, same least-privilege split used everywhere else.
  if (session.role === "Admin" || session.role === "Marketing" || session.role === "Operations") {
    tabs.push({
      key: "Dashboard",
      label: "Dashboard",
      content: (
        <ConsumablesDashboard
          rows={requests}
          catalog={catalog}
          canManageStatus={session.role === "Admin" || session.role === "Operations"}
          canManageCatalog={session.role === "Admin"}
        />
      ),
    });
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Consumables</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Request everyday items (toilet roll, cleaning supplies, stationery, printer toner, cash envelopes, and anything else added to
        the list) - each request goes straight to Chris Agnew.
      </p>
      <ConsumablesTabs tabs={tabs} />
    </div>
  );
}
