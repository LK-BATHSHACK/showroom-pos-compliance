import { NextRequest, NextResponse } from "next/server";
import { updateRecords, TABLES } from "@/lib/airtable";

// Lets the designer (or anyone logged in - single shared password, no
// per-role gating in V1) mark a flagged POS issue as fixed, without going
// into Airtable directly. This intentionally sets Status to "Resolved",
// NOT "Verified-Closed" - "Resolved" means "I've done the fix", but the
// score only gives credit for it (and Status only flips to
// "Verified-Closed") once the NEXT independent audit actually reports that
// POS item as Present-OK again - see the auto-verification step in
// processAuditSubmission.ts. This is deliberate: it stops a self-reported
// "done" from inflating compliance scores without anyone independently
// checking it actually landed.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
