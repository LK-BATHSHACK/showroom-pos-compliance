// Small helpers shared by the /api/bays routes (Round 28).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth-edge";
import { BayError } from "./repo";

export async function sessionOr403(allowed: (s: SessionPayload) => boolean): Promise<SessionPayload | NextResponse> {
  const s = await getSession();
  if (!s || !allowed(s)) return NextResponse.json({ error: "You don't have access to do that." }, { status: 403 });
  return s;
}

export function fail(e: unknown) {
  if (e instanceof BayError) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error("Bay register error:", e);
  return NextResponse.json({ error: "Something went wrong saving that. Please try again." }, { status: 500 });
}

export function photoFrom(form: FormData): File {
  const f = form.get("photo");
  if (!(f instanceof File) || !f.size) throw new BayError("Please take a photo of the bay.");
  return f;
}
