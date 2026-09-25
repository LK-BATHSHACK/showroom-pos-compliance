import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { MAX_ATTACHMENT_BYTES, type AttachmentUpload } from "@/lib/airtable";
import { sendConsumablesUpdate, DELIVERY_METHODS } from "@/lib/consumables";

// Needs Buffer (photos -> base64 for Airtable + email attachments).
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PHOTOS = 5;

// Chris/Operations (or Admin) sends the store a delivery update: packages,
// how it's coming, rough timing, a message and optional photos. Multipart
// form: a "payload" JSON field + any "photo" files (shrunk in the browser
// first, see lib/clientUpload.ts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireRole(["Admin", "Operations"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let payload: { message?: string; deliveryMethod?: string; expectedDelivery?: string; packageCount?: number | string | null };
  const photos: AttachmentUpload[] = [];
  try {
    const formData = await req.formData();
    const raw = formData.get("payload");
    if (typeof raw !== "string") return NextResponse.json({ error: "Missing update details." }, { status: 400 });
    payload = JSON.parse(raw);
    for (const value of formData.getAll("photo")) {
      if (!(value instanceof File)) continue;
      if (value.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: `"${value.name}" is over the 5MB photo limit - try a smaller photo.` }, { status: 400 });
      }
      photos.push({
        filename: value.name || "photo.jpg",
        contentType: value.type || "image/jpeg",
        base64: Buffer.from(await value.arrayBuffer()).toString("base64"),
      });
    }
  } catch {
    return NextResponse.json({ error: "Couldn't read the update - please try again." }, { status: 400 });
  }

  if (photos.length > MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos per update.` }, { status: 400 });
  const deliveryMethod = (payload.deliveryMethod || "").trim();
  if (deliveryMethod && !(DELIVERY_METHODS as readonly string[]).includes(deliveryMethod)) {
    return NextResponse.json({ error: "Pick a delivery method from the list." }, { status: 400 });
  }
  const pc = payload.packageCount === "" || payload.packageCount == null ? null : Math.round(Number(payload.packageCount));
  if (pc !== null && (!Number.isFinite(pc) || pc < 0 || pc > 999)) {
    return NextResponse.json({ error: "Number of packages doesn't look right." }, { status: 400 });
  }
  const message = (payload.message || "").trim().slice(0, 2000);
  const expectedDelivery = (payload.expectedDelivery || "").trim().slice(0, 200);
  if (!message && !deliveryMethod && !expectedDelivery && pc === null && photos.length === 0) {
    return NextResponse.json({ error: "Add at least one detail before sending." }, { status: 400 });
  }

  try {
    const result = await sendConsumablesUpdate({
      id: params.id,
      message,
      deliveryMethod,
      expectedDelivery,
      packageCount: pc,
      photos,
      sentByName: session.name,
      appHost: req.headers.get("host") || undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
