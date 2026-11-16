// Ryan/Admin close an item on the bay desk (Round 28).
import { NextRequest, NextResponse } from "next/server";
import { resolveException } from "@/lib/bays/repo";
import { isDeskRole } from "@/lib/bays/access";
import { sessionOr403, fail } from "@/lib/bays/api";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await sessionOr403(isDeskRole);
  if (s instanceof NextResponse) return s;
  try {
    const { note, dismiss } = (await req.json()) as { note?: string; dismiss?: boolean };
    await resolveException(params.id, String(note || "").slice(0, 1000), !!dismiss, s);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
