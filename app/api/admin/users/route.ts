import { NextRequest, NextResponse } from "next/server";
import { requireRole, hashPassword, generateTempPassword } from "@/lib/auth";
import { listRecords, createRecords, updateRecords, TABLES } from "@/lib/airtable";

type UserFields = {
  Name: string;
  Email: string;
  Role: "Admin" | "Marketing" | "H&S" | "Store Manager";
  Site?: string[];
  Active?: boolean;
  MustChangePassword?: boolean;
  LastLoginAt?: string;
};

export async function GET() {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const [users, sites] = await Promise.all([
    listRecords<UserFields>(TABLES.USERS),
    listRecords<{ SiteName: string }>(TABLES.SITES),
  ]);
  const siteName = (id?: string) => sites.find((s) => s.id === id)?.fields.SiteName || null;

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.fields.Name,
      email: u.fields.Email,
      role: u.fields.Role,
      siteId: u.fields.Site?.[0] || null,
      siteName: siteName(u.fields.Site?.[0]),
      active: u.fields.Active !== false,
      mustChangePassword: !!u.fields.MustChangePassword,
      lastLoginAt: u.fields.LastLoginAt || null,
    })),
    sites: sites.map((s) => ({ id: s.id, name: s.fields.SiteName })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { name, email, role, siteId } = await req.json();
  if (!name || !email || !role) {
    return NextResponse.json({ error: "Name, email and role are required." }, { status: 400 });
  }
  if (!["Admin", "Marketing", "H&S", "Store Manager"].includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  if (role === "Store Manager" && !siteId) {
    return NextResponse.json({ error: "Store Manager accounts need a Site." }, { status: 400 });
  }

  const existing = await listRecords<UserFields>(TABLES.USERS);
  if (existing.some((u) => (u.fields.Email || "").toLowerCase() === String(email).toLowerCase())) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const fields: Record<string, any> = {
    Name: name,
    Email: email,
    PasswordHash: hashPassword(tempPassword),
    Role: role,
    Active: true,
    MustChangePassword: true,
  };
  if (siteId) fields.Site = [siteId];

  const [created] = await createRecords<UserFields>(TABLES.USERS, [fields as UserFields]);

  // Temp password is returned once, in this response only - never stored in
  // plaintext, never logged. The admin creating the account is responsible
  // for passing it to the new user through a reasonable channel.
  return NextResponse.json({ success: true, id: created.id, tempPassword });
}

export async function PATCH(req: NextRequest) {
  const session = await requireRole(["Admin"]);
  if (!session) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id, role, siteId, active, resetPassword } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const fields: Record<string, any> = {};
  if (role) fields.Role = role;
  if (siteId !== undefined) fields.Site = siteId ? [siteId] : [];
  if (active !== undefined) fields.Active = !!active;

  let tempPassword: string | undefined;
  if (resetPassword) {
    tempPassword = generateTempPassword();
    fields.PasswordHash = hashPassword(tempPassword);
    fields.MustChangePassword = true;
  }

  await updateRecords(TABLES.USERS, [{ id, fields }]);
  return NextResponse.json({ success: true, tempPassword });
}
