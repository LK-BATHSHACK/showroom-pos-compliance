// Product search for the change and check forms (Round 28). Reads the
// Acumatica product cache only.
import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/bays/repo";
import { BAY_VIEW_ROLES } from "@/lib/bays/access";
import { sessionOr403, fail } from "@/lib/bays/api";

export async function GET(req: NextRequest) {
  const s = await sessionOr403((x) => BAY_VIEW_ROLES.includes(x.role));
  if (s instanceof NextResponse) return s;
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 80);
    const products = await searchProducts(q, 12);
    return NextResponse.json({ products: products.map((p) => ({ sku: p.sku, description: p.description })) });
  } catch (e) {
    return fail(e);
  }
}
