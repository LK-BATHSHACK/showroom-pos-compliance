import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { submitPOSWalkaround, resolveShowroomForSite, type PosWalkaroundAnswer, type ShowroomForSite, type PosWalkaroundResult } from "@/lib/posWalkaround";
import { MAX_ATTACHMENT_BYTES, type AttachmentUpload } from "@/lib/airtable";

// Needs Buffer (base64-encoding uploaded photos for Airtable's attachment
// API) - not edge-safe, same reasoning as /api/hs-submission and
// /api/upload-audit.
export const runtime = "nodejs";

// Submitted as multipart/form-data (same shape as /api/hs-submission): a
// "payload" field holds {showroomId, showroomName, answers} JSON, and any
// selected photos are appended as "file__<qnum>" fields.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!["Admin", "Marketing", "Store Manager"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let showroomId: string;
  let showroomName: string;
  let answers: PosWalkaroundAnswer[];
  const files: Record<number, AttachmentUpload[]> = {};

  try {
    const formData = await req.formData();
    const payloadRaw = formData.get("payload");
    if (typeof payloadRaw !== "string") {
      return NextResponse.json({ error: "Missing submission payload." }, { status: 400 });
    }
    const payload = JSON.parse(payloadRaw);
    showroomId = payload.showroomId;
    showroomName = payload.showroomName;
    answers = payload.answers;
    if (!showroomName || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Missing showroom or answers." }, { status: 400 });
    }

    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("file__") || !(value instanceof File)) continue;
      const qnum = Number(key.slice("file__".length));
      if (value.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `"${value.name}" is over the 5MB photo limit - try a smaller photo.` }, { status: 400 });
      }
      const buffer = Buffer.from(await value.arrayBuffer());
      (files[qnum] ||= []).push({
        filename: value.name || "photo.jpg",
        contentType: value.type || "application/octet-stream",
        base64: buffer.toString("base64"),
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Couldn't read the submission - please try again." }, { status: 400 });
  }

  // Store Managers can only submit for their own assigned site's showroom -
  // enforced server-side, not just by hiding the picker client-side. Their
  // showroomId is re-resolved from the session's siteId rather than trusted
  // from the client payload.
  if (session.role === "Store Manager") {
    if (!session.siteId) return NextResponse.json({ error: "Your account isn't assigned to a site." }, { status: 403 });
    const resolved = await resolveShowroomForSite(session.siteId);
    // tsconfig has strict/strictNullChecks off, so plain `if (!resolved.applies)`
    // doesn't narrow this discriminated union - branch on Extract<> explicitly
    // (same pattern as lib/posWalkaround.ts's own submitPOSWalkaround).
    if (!resolved.applies) {
      const notApplicable = resolved as Extract<ShowroomForSite, { applies: false }>;
      return NextResponse.json({ error: notApplicable.reason }, { status: 403 });
    }
    if (resolved.showroomName !== showroomName) {
      return NextResponse.json({ error: "You can only submit for your assigned showroom." }, { status: 403 });
    }
  }

  try {
    const submitted = await submitPOSWalkaround({
      showroomName,
      submittedByEmail: session.email,
      answers,
      files,
    });
    if (!submitted.ok) {
      const failed = submitted as Extract<PosWalkaroundResult, { ok: false }>;
      return NextResponse.json({ error: failed.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...submitted });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
