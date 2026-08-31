import Link from "next/link";
import { listRecords, TABLES } from "@/lib/airtable";
import RequestsTabs from "@/components/RequestsTabs";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const [requests, showrooms] = await Promise.all([
    listRecords<any>(TABLES.POS_REQUESTS, { sort: [{ field: "RequestDate", direction: "desc" }] }),
    listRecords<{ ShowroomName: string }>(TABLES.SHOWROOMS),
  ]);
  const nameById: Record<string, string> = {};
  showrooms.forEach((s) => (nameById[s.id] = s.fields.ShowroomName));

  const rows = requests.map((r) => ({ request: r, showroomName: nameById[r.fields.Showroom?.[0]] || "-" }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>POS Requests</h1>
          <p style={{ color: "#6E6E6E", marginTop: 0 }}>{requests.length} submitted</p>
        </div>
        <Link
          href="/requests/new"
          style={{ background: "#E6017E", color: "#fff", padding: "10px 18px", borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
        >
          + Submit a Request
        </Link>
      </div>

      <RequestsTabs rows={rows} />
    </div>
  );
}
