import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { fetchPosShowrooms, resolveShowroomForSite, type ShowroomForSite } from "@/lib/posWalkaround";
import UploadTabs from "@/components/UploadTabs";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const session = await requireRole(["Admin", "Marketing", "Store Manager"]);
  if (!session) redirect("/login");

  const showrooms = session.role === "Store Manager" ? [] : await fetchPosShowrooms();

  // Store Managers submit only for their own site's showroom - no picker,
  // resolved server-side via Sites.SourceShowroom (see lib/posWalkaround.ts)
  // and re-checked again on submit. Their site might not have POS checks at
  // all (e.g. a Warehouse & Offices site) - shown as a friendly message
  // rather than a broken form.
  let lockedShowroom: { id: string; name: string } | null = null;
  let lockedShowroomError: string | null = null;
  if (session.role === "Store Manager") {
    if (!session.siteId) {
      lockedShowroomError = "Your account isn't assigned to a site - ask an Admin to fix this.";
    } else {
      const resolved = await resolveShowroomForSite(session.siteId);
      if (resolved.applies) {
        lockedShowroom = { id: resolved.showroomId, name: resolved.showroomName };
      } else {
        // tsconfig has strict/strictNullChecks off, so the `else` branch
        // here doesn't narrow this discriminated union on its own.
        lockedShowroomError = (resolved as Extract<ShowroomForSite, { applies: false }>).reason;
      }
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Submit an Audit</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 20 }}>
        Fill out the monthly POS checklist directly, or - for Jordan's spot-check rounds - upload the completed
        workbook instead.
      </p>
      <UploadTabs
        showrooms={showrooms}
        lockedShowroom={lockedShowroom}
        lockedShowroomError={lockedShowroomError}
        submittedByName={session.name}
        showExcelTab={session.role !== "Store Manager"}
      />
    </div>
  );
}
