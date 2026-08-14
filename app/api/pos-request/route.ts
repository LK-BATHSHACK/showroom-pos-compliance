import { NextRequest, NextResponse } from "next/server";
import { createRecords, listRecords, TABLES } from "@/lib/airtable";
import { sendEmail, emailShell } from "@/lib/resend";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      showroomName, requesterName, requesterEmail, ideaDescription,
      businessReason, customerProblemOpportunity, suggestedLocation,
      productCategory, urgency, otherShowroomsMayBenefit,
    } = body;

    if (!showroomName || !ideaDescription) {
      return NextResponse.json({ error: "Showroom and idea description are required." }, { status: 400 });
    }

    const showrooms = await listRecords<{ ShowroomName: string }>(TABLES.SHOWROOMS);
    const showroom = showrooms.find((s) => s.fields.ShowroomName === showroomName);

    const today = new Date().toISOString().slice(0, 10);
    const [created] = await createRecords(TABLES.POS_REQUESTS, [
      {
        Showroom: showroom ? [showroom.id] : [],
        RequesterName: requesterName || "",
        RequesterEmail: requesterEmail || "",
        RequestDate: today,
        IdeaDescription: ideaDescription,
        BusinessReason: businessReason || "",
        CustomerProblemOpportunity: customerProblemOpportunity || "",
        SuggestedLocation: suggestedLocation || "",
        ProductCategory: productCategory || "",
        Urgency: urgency || "Medium",
        OtherShowroomsMayBenefit: !!otherShowroomsMayBenefit,
        Status: "Submitted",
      },
    ]);

    const notifyEmail = process.env.MARKETING_NOTIFY_EMAIL;
    if (notifyEmail) {
      await sendEmail(
        notifyEmail,
        `New POS idea submitted: ${showroomName}`,
        emailShell(
          "New POS Idea/Request",
          `<p><strong>Showroom:</strong> ${showroomName}<br/>
           <strong>Submitted by:</strong> ${requesterName || "-"} (${requesterEmail || "no email given"})<br/>
           <strong>Urgency:</strong> ${urgency || "Medium"}</p>
           <p><strong>Idea:</strong> ${ideaDescription}</p>
           <p>Review it in the app's POS Requests tab.</p>`
        )
      );
    }

    return NextResponse.json({ success: true, id: created.id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
