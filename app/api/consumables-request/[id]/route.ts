import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  updateConsumablesRequestStatus,
  markConsumablesReceived,
  getConsumablesRequestSummary,
  CONSUMABLES_STATUSES,
} from "@/lib/consumables";

// Status changes:
//  - Admin / Operations (Chris Agnew) can set any status from the Dashboard.
//  - Store Managers can only mark their OWN site's request as received
//    (status "Fulfilled") - Lorraine, 25 Sep 2026: stores should be the ones
//    hitting Fulfilled when the order arrives. Enforced here, not just by
//    what the page shows.
// Marketing stays view-only, same least-privilege split as everywhere else.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { status } = await req.json();
  if (!(CONSUMABLES_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  if (session.role === "Admin" || session.role === "Operations") {
    if (status === "Fulfilled") await markConsumablesReceived(params.id, session.name);
    else await updateConsumablesRequestStatus(params.id, status, session.name);
    return NextResponse.json({ success: true });
  }

  if (session.role === "Store Manager") {
    if (status !== "Fulfilled") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    const request = await getConsumablesRequestSummary(params.id);
    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (!session.siteId || request.siteId !== session.siteId) {
      return NextResponse.json({ error: "You can only update your own site's requests." }, { status: 403 });
    }
    await markConsumablesReceived(params.id, session.name);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}
