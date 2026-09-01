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

  // Store Managers only ever see the in-tool checklist (no Excel tab), so
  // their intro line shouldn't mention an "upload" option that isn't on the
  // page in front of them (31 Aug 2026 - Lorraine: "update that copy so it
  // makes sence for a showroom reading it").
  const introCopy =
    session.role === "Store Manager"
      ? "Complete your showroom's monthly POS check below - it takes about 10 minutes and covers everything from window POS to till-point signage."
      : "Fill out a POS check directly below by the 27th of each month. A delay in uploading will bring down your compliance score and will trigger your regional manager to review with you.";

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>POS Check</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 20 }}>{introCopy}</p>
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
