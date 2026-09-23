import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createConsumableItem, updateConsumableItem, CONSUMABLE_CATEGORIES } from "@/lib/consumables";

// Admin-only "Add item" flow (Lorraine, 10 Sep 2026: "allow admin to add in
// more when needed with an add button") - adds straight to the live catalog,
// no Airtable access needed. Deliberately Admin-only, matching the ask;
// Operations (Chris) still fulfils requests but doesn't manage the catalog
// itself - easy to widen to Operations too later if that turns out to be
// wanted.
export async function POST(req: NextRequest) {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const { name, category, unit } = (await req.json()) as { name?: string; category?: string; unit?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Item name is required." }, { status: 400 });
    }
    if (!category || !CONSUMABLE_CATEGORIES.includes(category as any)) {
      return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
    }

    const item = await createConsumableItem({ name, category, unit });
    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}

// Edit or remove an existing item (Admin only, same as adding). Remove is a
// soft remove (Active = false) - see updateConsumableItem.
export async function PATCH(req: NextRequest) {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const { id, name, category, unit, active } = (await req.json()) as {
      id?: string;
      name?: string;
      category?: string;
      unit?: string;
      active?: boolean;
    };
    if (!id) return NextResponse.json({ error: "Item id is required." }, { status: 400 });
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Item name can't be blank." }, { status: 400 });
    }
    if (category !== undefined && !CONSUMABLE_CATEGORIES.includes(category as any)) {
      return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
    }
    await updateConsumableItem(id, { name, category, unit, active });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
