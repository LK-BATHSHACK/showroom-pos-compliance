import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, createSessionValue } from "@/lib/auth-edge";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!expected || !secret) {
    return NextResponse.json({ error: "Server is not configured (missing APP_PASSWORD or SESSION_SECRET)." }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const value = await createSessionValue(secret, Date.now());
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
