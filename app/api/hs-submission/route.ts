import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { submitHSWalkaround, type AnswerInput } from "@/lib/hsSubmission";
import { MAX_ATTACHMENT_BYTES, type AttachmentUpload } from "@/lib/airtable";

// Needs Buffer (base64-encoding uploaded photos for Airtable's attachment
// API) - not edge-safe, same reasoning as /api/upload-audit.
export const runtime = "nodejs";

// Submitted as multipart/form-data, not JSON, because H&S Walkaround
// submissions can carry photos (Q62, up to 10 files): a "payload" field
// holds the same {siteId, answers} JSON as before, and any selected photo
// files are appended as extra form fields named "file__<questionId>".
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!["Admin", "Marketing", "H&S", "Store Manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let siteId: string;
  let answers: AnswerInput[];
  const files: Record<string, AttachmentUpload[]> = {};

  try {
    const formData = await req.formData();
    const payloadRaw = formData.get("payload");
    if (typeof payloadRaw !== "string") {
      return NextResponse.json({ error: "Missing submission payload." }, { status: 400 });
    }
    const payload = JSON.parse(payloadRaw);
    siteId = payload.siteId;
    answers = payload.answers;
    if (!siteId || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Missing siteId or answers." }, { status: 400 });
    }

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("file__") || !(value instanceof File)) continue;
      const questionId = key.slice("file__".length);
      if (value.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `"${value.name}" is over the 5MB photo limit - try a smaller photo.` }, { status: 400 });
      }
      const buffer = Buffer.from(await value.arrayBuffer());
      (files[questionId] ||= []).push({
        filename: value.name || "photo.jpg",
        contentType: value.type || "application/octet-stream",
        base64: buffer.toString("base64"),
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Couldn't read the submission - please try again." }, { status: 400 });
  }

  // Store Managers can only submit for their own assigned site - enforced
  // server-side, not just by hiding the picker client-side.
  if (session.role === "Store Manager" && siteId !== session.siteId) {
    return NextResponse.json({ error: "You can only submit for your assigned site." }, { status: 403 });
  }

  try {
    const result = await submitHSWalkaround({
      siteId,
      submittedByName: session.name,
      submittedByEmail: session.email,
      answers,
      files,
      appHost: req.headers.get("host") || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
