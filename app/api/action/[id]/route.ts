import { NextRequest, NextResponse } from "next/server";
import { updateRecords, TABLES } from "@/lib/airtable";
import { requireRole } from "@/lib/auth";

// Lets Marketing/H&S/Admin mark a flagged issue (POS or, now the Actions
// table is generalised, H&S) as fixed, without going into Airtable
// directly. Store Manager is deliberately excluded - same reasoning as
// before per-user accounts existed: a self-reported "done" shouldn't be
// able to close out its own flagged issue without HQ/H&S oversight. This
// intentionally sets Status to "Resolved", NOT "Verified-Closed" -
// "Resolved" means "I've done the fix", but the score only gives credit for
// it (and Status only flips to "Verified-Closed") once the NEXT independent
// audit actually reports that POS item as Present-OK again - see the
// auto-verification step in processAuditSubmission.ts.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["Admin", "Marketing", "H&S"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const { status, resolutionNotes } = await req.json();
    if (!["Open", "In progress", "Resolved"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const today = new Date().toISOString().slice(0, 10);
    const fields: Record<string, any> = { Status: status, ResolutionNotes: resolutionNotes || "" };
    if (status === "Resolved") fields.DateCompleted = today;

    const [updated] = await updateRecords<any>(TABLES.ACTIONS, [{ id: params.id, fields }]);
    return NextResponse.json({ success: true, record: updated });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
