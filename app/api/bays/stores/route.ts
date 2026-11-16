// Admin: switch a store on for the bay register, and add its bays (Round 28).
import { NextRequest, NextResponse } from "next/server";
import { fetchSites } from "@/lib/hsSubmission";
import { setUpStore, addBays, getStore } from "@/lib/bays/repo";
import { sessionOr403, fail } from "@/lib/bays/api";

export async function POST(req: NextRequest) {
  const s = await sessionOr403((x) => x.role === "Admin");
  if (s instanceof NextResponse) return s;
  try {
    const { siteId, code, labels } = (await req.json()) as { siteId?: string; code?: string; labels?: string };
    if (!siteId) return NextResponse.json({ error: "Pick a store." }, { status: 400 });
    if (code) {
      const site = (await fetchSites()).find((x) => x.id === siteId);
      if (!site || !site.region) return NextResponse.json({ error: "That store needs a region on the Stores page first." }, { status: 400 });
      await setUpStore({ id: site.id, name: site.name, region: site.region }, code, s.name);
    }
    let added = 0;
    if (labels) {
      if (!(await getStore(siteId))) return NextResponse.json({ error: "Set the store up first." }, { status: 400 });
      added = await addBays(siteId, labels.split(/[\s,]+/), s.name);
    }
    return NextResponse.json({ ok: true, added });
  } catch (e) {
    return fail(e);
  }
}
