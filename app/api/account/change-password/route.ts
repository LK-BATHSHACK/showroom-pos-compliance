import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";
import { listRecords, updateRecords, TABLES } from "@/lib/airtable";

type UserFields = { PasswordHash: string; MustChangePassword?: boolean };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!newPassword || String(newPassword).length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const users = await listRecords<UserFields>(TABLES.USERS);
  const record = users.find((u) => u.id === session.uid);
  if (!record) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  // Skip the current-password check only on a forced first-login change,
  // where the user is proving identity via the temp password at /login itself.
  if (!record.fields.MustChangePassword) {
    if (!currentPassword || !verifyPassword(currentPassword, record.fields.PasswordHash)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }
  }

  await updateRecords(TABLES.USERS, [
    { id: record.id, fields: { PasswordHash: hashPassword(newPassword), MustChangePassword: false } },
  ]);

  return NextResponse.json({ success: true });
}
