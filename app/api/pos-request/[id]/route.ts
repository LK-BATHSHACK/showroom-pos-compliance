import { NextRequest, NextResponse } from "next/server";
import { updateRecords, TABLES } from "@/lib/airtable";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, marketingComments, decisionByName } = await req.json();
    const today = new Date().toISOString().slice(0, 10);
    const [updated] = await updateRecords(TABLES.POS_REQUESTS, [
      {
        id: params.id,
        fields: {
          Status: status,
          MarketingComments: marketingComments || "",
          DecisionDate: today,
          DecisionByName: decisionByName || "",
        },
      },
    ]);
    return NextResponse.json({ success: true, record: updated });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
