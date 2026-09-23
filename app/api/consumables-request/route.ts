import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listRecords, TABLES } from "@/lib/airtable";
import { createConsumablesRequest } from "@/lib/consumables";

export async function POST(req: NextRequest) {
  const session = await requireRole(["Admin", "Marketing", "Store Manager"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const body = await req.json();
    const { siteId, notes, lines } = body as {
      siteId?: string;
      notes?: string;
      lines?: { itemId: string; quantity: number; notes?: string }[];
    };

    // Store Managers can only submit for their own assigned site, no matter
    // what the client sends - enforced server-side same as the H&S form.
    const resolvedSiteId = session.role === "Store Manager" ? session.siteId : siteId;
    if (!resolvedSiteId) {
      return NextResponse.json({ error: "Site is required." }, { status: 400 });
    }
    // Quantity is fixed at 1 for now (Lorraine, 23 Sep 2026: "We would like
    // the quantity option removed for now so they can't order more than 1 qty
    // of something") - enforced here too, not just by hiding the field, and
    // each item can only appear once per request.
    const seen = new Set<string>();
    const cleanLines = (lines || [])
      .filter((l) => l.itemId && !seen.has(l.itemId) && seen.add(l.itemId))
      .map((l) => ({ ...l, quantity: 1 }));
    if (cleanLines.length === 0) {
      return NextResponse.json({ error: "Add at least one item." }, { status: 400 });
    }

    const [sites, items] = await Promise.all([
      listRecords<{ SiteName: string }>(TABLES.SITES),
      listRecords<{ Name: string }>(TABLES.CONSUMABLE_ITEMS),
    ]);
    const site = sites.find((s) => s.id === resolvedSiteId);
    if (!site) return NextResponse.json({ error: "Unknown site." }, { status: 400 });

    const itemNameById = new Map(items.map((i) => [i.id, i.fields.Name]));

    const id = await createConsumablesRequest({
      siteId: resolvedSiteId,
      siteName: site.fields.SiteName,
      requestedByName: session.name,
      requestedByEmail: session.email,
      notes,
      lines: cleanLines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), notes: l.notes })),
      itemNameById,
      appHost: req.headers.get("host") || undefined,
    });

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
