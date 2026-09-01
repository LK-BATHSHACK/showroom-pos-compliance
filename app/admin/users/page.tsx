import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireRole(["Admin"]);
  if (!session) redirect("/dashboard");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Users & Access</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Create and manage accounts. Store Manager accounts are locked to submitting POS Checks and H&S Checks for
        their assigned Site only; H&S and Marketing can see everything under H&S Review; Admin has full access.
      </p>
      <UsersAdmin />
    </div>
  );
}
