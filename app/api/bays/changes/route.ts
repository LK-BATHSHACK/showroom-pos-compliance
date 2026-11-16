// Raise a display change (Round 28). Ryan/Admin: goes straight to the store.
// Store Manager: own store only, waits for Ryan's approval.
import { NextRequest, NextResponse } from "next/server";
import { select } from "@/lib/bays/db";
import { createChange, getChange, getStore, type NewChangeItem } from "@/lib/bays/repo";
import { canChangeStore, BAY_CHANGE_ROLES } from "@/lib/bays/access";
import { notifyChangeRaised } from "@/lib/bays/notify";
import { sessionOr403, fail } from "@/lib/bays/api";
import type { Bay } from "@/lib/bays/types";

export async function POST(req: NextRequest) {
  const s = await sessionOr403((x) => BAY_CHANGE_ROLES.includes(x.role));
  if (s instanceof NextResponse) return s;
  try {
    const body = (await req.json()) as { bayCode?: string; items?: NewChangeItem[]; note?: string; needsOrder?: boolean };
    const bay = (await select<Bay>("bays", { eq: { bay_code: String(body.bayCode || "").toUpperCase() } }))[0];
    if (!bay || !canChangeStore(s, bay.store_id)) return NextResponse.json({ error: "You can't change that bay." }, { status: 403 });
    const items = (body.items || []).slice(0, 20).filter((i) => ["Add", "Remove", "Replace"].includes(i.action));
    const change = await createChange(bay, { items, note: String(body.note || "").slice(0, 1000), needsOrder: !!body.needsOrder }, s);
    const view = await getChange(change.id);
    const store = await getStore(bay.store_id);
    if (view) await notifyChangeRaised(view, store?.name || "", req.headers.get("host") || undefined);
    return NextResponse.json({ ok: true, id: change.id, status: change.status });
  } catch (e) {
    return fail(e);
  }
}
