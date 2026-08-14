import { NextRequest, NextResponse } from "next/server";
import { updateRecords, getRecord, TABLES } from "@/lib/airtable";
import { sendEmail, emailShell } from "@/lib/resend";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, marketingComments, decisionByName } = await req.json();
    const today = new Date().toISOString().slice(0, 10);
    const [updated] = await updateRecords<any>(TABLES.POS_REQUESTS, [
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

    const f = updated.fields;
    let showroomName = "-";
    const showroomId = f.Showroom?.[0];
    if (showroomId) {
      try {
        const showroom = await getRecord<{ ShowroomName: string }>(TABLES.SHOWROOMS, showroomId);
        showroomName = showroom.fields.ShowroomName;
      } catch {
        // Non-fatal - the decision itself has already been saved either way.
      }
    }

    if (status === "Approved") {
      const designerEmail = process.env.DESIGNER_NOTIFY_EMAIL;
      if (designerEmail) {
        await sendEmail(
          designerEmail,
          `POS idea approved - create & roll out: ${showroomName}`,
          emailShell(
            "POS Idea Approved",
            `<p>This POS idea has been approved - please create and roll out.</p>
             <p><strong>Showroom:</strong> ${showroomName}<br/>
             <strong>Requested by:</strong> ${f.RequesterName || "-"}<br/>
             <strong>Urgency:</strong> ${f.Urgency || "-"}<br/>
             <strong>Product category:</strong> ${f.ProductCategory || "-"}<br/>
             <strong>Suggested location:</strong> ${f.SuggestedLocation || "-"}</p>
             <p><strong>Idea:</strong> ${f.IdeaDescription || "-"}</p>
             ${f.BusinessReason ? `<p><strong>Business reason:</strong> ${f.BusinessReason}</p>` : ""}
             ${f.CustomerProblemOpportunity ? `<p><strong>Customer problem/opportunity:</strong> ${f.CustomerProblemOpportunity}</p>` : ""}
             ${f.OtherShowroomsMayBenefit ? `<p style="background:#FFF6FA; border-left:4px solid #E6017E; padding:8px 12px;">Other showrooms may benefit from this too.</p>` : ""}
             ${marketingComments ? `<p><strong>Marketing comments:</strong> ${marketingComments}</p>` : ""}`
          )
        );
      }
    } else if (status === "Declined") {
      if (f.RequesterEmail) {
        await sendEmail(
          f.RequesterEmail,
          `Update on your POS idea: ${showroomName}`,
          emailShell(
            "POS Idea - Update",
            `<p>Thanks for submitting your POS idea for <strong>${showroomName}</strong> - after review, it hasn't been approved this time.</p>
             <p><strong>Your idea:</strong> ${f.IdeaDescription || "-"}</p>
             <p><strong>Reason:</strong> ${marketingComments || "No specific reason given - contact Marketing if you'd like more detail."}</p>
             <p>Feel free to submit another idea any time.</p>`
          )
        );
      }
    }

    return NextResponse.json({ success: true, record: updated });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
