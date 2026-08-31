import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, createSessionValue } from "@/lib/auth-edge";
import { verifyPassword } from "@/lib/auth";
import { listRecords, updateRecords, TABLES } from "@/lib/airtable";

type UserFields = {
  Name: string;
  Email: string;
  PasswordHash: string;
  Role: "Admin" | "Marketing" | "H&S" | "Store Manager";
  Site?: string[];
  Active?: boolean;
};

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Server is not configured (missing SESSION_SECRET)." }, { status: 500 });
  }
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  // Case-insensitive match on Email - Airtable filterByFormula would need
  // this too, so just fetch and compare in code (Users table is small).
  const users = await listRecords<UserFields>(TABLES.USERS);
  const match = users.find((u) => (u.fields.Email || "").toLowerCase() === String(email).toLowerCase());

  if (!match || match.fields.Active === false || !match.fields.PasswordHash) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  if (!verifyPassword(password, match.fields.PasswordHash)) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  // Resolve the user's Site name for Store Managers, so the session cookie
  // doesn't require a further Airtable round-trip just to show/scope by site.
  let siteId: string | null = null;
  let siteName: string | null = null;
  if (match.fields.Site && match.fields.Site.length > 0) {
    siteId = match.fields.Site[0];
    try {
      const sites = await listRecords<{ SiteName: string }>(TABLES.SITES, {});
      siteName = sites.find((s) => s.id === siteId)?.fields.SiteName || null;
    } catch {
      siteName = null;
    }
  }

  const value = await createSessionValue(
    secret,
    {
      uid: match.id,
      name: match.fields.Name,
      email: match.fields.Email,
      role: match.fields.Role,
      siteId,
      siteName,
    },
    Date.now()
  );

  // Best-effort last-login stamp - don't fail the login if this write fails.
  updateRecords(TABLES.USERS, [{ id: match.id, fields: { LastLoginAt: new Date().toISOString() } }]).catch(() => {});

  const res = NextResponse.json({ success: true, role: match.fields.Role, mustChangePassword: !!(match.fields as any).MustChangePassword });
  res.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
