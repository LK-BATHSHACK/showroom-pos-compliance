// A store checks a bay against the register, with a photo (Round 28).
// Differences never change the register directly - they go to Ryan's desk.
import { NextRequest, NextResponse } from "next/server";
import { select } from "@/lib/bays/db";
import { checkBay, type CheckResult } from "@/lib/bays/repo";
import { canCheckStore, BAY_CHECK_ROLES } from "@/lib/bays/access";
import { sessionOr403, fail, photoFrom } from "@/lib/bays/api";
import type { Bay } from "@/lib/bays/types";

export async function POST(req: NextRequest) {
  const s = await sessionOr403((x) => BAY_CHECK_ROLES.includes(x.role));
  if (s instanceof NextResponse) return s;
  try {
    const form = await req.formData();
    const bay = (await select<Bay>("bays", { eq: { bay_code: String(form.get("bayCode") || "").toUpperCase() } }))[0];
    if (!bay || !canCheckStore(s, bay.store_id)) return NextResponse.json({ error: "You can't check that bay." }, { status: 403 });
    const results = JSON.parse(String(form.get("results") || "[]")) as CheckResult[];
    const added = JSON.parse(String(form.get("added") || "[]")) as { sku?: string; text?: string }[];
    const clean = results
      .filter((r) => ["Present", "Missing", "Different"].includes(r.result))
      .map((r) => ({ lineId: String(r.lineId), result: r.result, note: String(r.note || "").slice(0, 300) }));
    const out = await checkBay(bay, { results: clean, added: added.slice(0, 20), kind: form.get("kind") === "Monthly" ? "Monthly" : "Capture" }, photoFrom(form), s);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return fail(e);
  }
}
