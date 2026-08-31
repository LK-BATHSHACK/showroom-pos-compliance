import { NextRequest, NextResponse } from "next/server";
import { createRecords, listRecords, TABLES } from "@/lib/airtable";
import { sendEmail, emailShell } from "@/lib/resend";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await requireRole(["Admin", "Marketing"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const body = await req.json();
    const {
      showroomName, requesterName, requesterEmail, ideaDescription,
      businessReason, customerProblemOpportunity, suggestedLocation,
      productCategory, urgency, otherShowroomsMayBenefit, requestType,
    } = body;

    if (!showroomName || !ideaDescription) {
      return NextResponse.json({ error: "Showroom and idea description are required." }, { status: 400 });
    }
    // Defaults to "New Idea" for older callers that don't send this yet -
    // matches RequestTypeBadge's own fallback.
    const resolvedRequestType = requestType === "Replacement/Support Request" ? "Replacement/Support Request" : "New Idea";

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
        RequestType: resolvedRequestType,
        Status: "Submitted",
      },
    ]);

    const notifyEmail = process.env.MARKETING_NOTIFY_EMAIL;
    if (notifyEmail) {
      await sendEmail(
        notifyEmail,
        `New POS ${resolvedRequestType === "New Idea" ? "idea" : "replacement/support request"} submitted: ${showroomName}`,
        emailShell(
          "New POS Idea/Request",
          `<p><strong>Type:</strong> ${resolvedRequestType}<br/>
           <strong>Showroom:</strong> ${showroomName}<br/>
           <strong>Submitted by:</strong> ${requesterName || "-"} (${requesterEmail || "no email given"})<br/>
           <strong>Urgency:</strong> ${urgency || "Medium"}</p>
           <p><strong>Details:</strong> ${ideaDescription}</p>
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
