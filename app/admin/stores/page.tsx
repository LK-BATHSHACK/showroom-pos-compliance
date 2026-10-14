import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import StoresAdmin from "@/components/StoresAdmin";

export const dynamic = "force-dynamic";

export default async function AdminStoresPage() {
  const session = await requireRole(["Admin"]);
  if (!session) redirect("/dashboard");

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Stores</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Add a store and choose which checks it does. A Store Manager only sees the checks their store is set up
        for. To give a store a login, add a Store Manager in Users &amp; Access and pick the store as their Site.
      </p>
      <StoresAdmin />
    </div>
  );
}
