import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { updateConsumablesRequestStatus } from "@/lib/consumables";

const VALID_STATUSES = ["Requested", "Ordered", "Fulfilled"];

// Status updates are Admin/Operations only (Chris Agnew is Operations) -
// Marketing can view the dashboard but doesn't move requests through the
// workflow, same least-privilege split as everywhere else in this app.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["Admin", "Operations"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  await updateConsumablesRequestStatus(params.id, status, session.name);
  return NextResponse.json({ success: true });
}
