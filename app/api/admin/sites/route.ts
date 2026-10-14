import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { fetchStores, createStore, updateStore, validateStoreInput, StoreError, type StoreInput } from "@/lib/sites";

// Stores admin (Round 26) - Admin only, same as Users & Access. No DELETE on
// purpose: a store has submissions, actions and consumables history linked
// to it, so it's switched off (Active) rather than removed.

function readInput(body: any): StoreInput {
  return {
    name: String(body?.name ?? ""),
    siteType: String(body?.siteType ?? ""),
    region: String(body?.region ?? ""),
    auditGroup: body?.auditGroup ? String(body.auditGroup) : null,
    active: body?.active !== false,
    pos: body?.pos === true,
    hs: body?.hs === true,
    hsVersion: String(body?.hsVersion ?? ""),
  };
}

export async function GET() {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return NextResponse.json({ stores: await fetchStores() });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const input = readInput(await req.json().catch(() => ({})));
  const invalid = validateStoreInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    const { id } = await createStore(input);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Couldn't save the store - please try again." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^rec[A-Za-z0-9]{3,}$/.test(id)) return NextResponse.json({ error: "Missing store id." }, { status: 400 });

  const input = readInput(body);
  const invalid = validateStoreInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  try {
    await updateStore(id, input);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof StoreError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Couldn't save the store - please try again." }, { status: 500 });
  }
}
