// Act on a change (Round 28):
//  JSON {action:"approve"|"reject", note}  - Layout Lead/Admin, store-raised changes
//  JSON {action:"cancel"}                  - Layout Lead/Admin
//  multipart {action:"install", photo}     - the store (or Ryan/Admin) confirms it's done
import { NextRequest, NextResponse } from "next/server";
import { getChange, decideChange, cancelChange, installChange } from "@/lib/bays/repo";
import { canCheckStore, isDeskRole, BAY_CHECK_ROLES } from "@/lib/bays/access";
import { sessionOr403, fail, photoFrom } from "@/lib/bays/api";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionOr403((x) => BAY_CHECK_ROLES.includes(x.role));
  if (s instanceof NextResponse) return s;
  try {
    const change = await getChange(params.id);
    if (!change) return NextResponse.json({ error: "Change not found." }, { status: 404 });
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await req.formData();
      if (form.get("action") !== "install") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
      if (!canCheckStore(s, change.store_id)) return NextResponse.json({ error: "You can't update that store's bays." }, { status: 403 });
      await installChange(change, photoFrom(form), s);
      return NextResponse.json({ ok: true });
    }
    const { action, note } = (await req.json()) as { action?: string; note?: string };
    if (!isDeskRole(s)) return NextResponse.json({ error: "Only Ryan or an Admin can do that." }, { status: 403 });
    if (action === "approve" || action === "reject") await decideChange(change, action === "approve", String(note || "").slice(0, 1000), s);
    else if (action === "cancel") await cancelChange(change, s);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
