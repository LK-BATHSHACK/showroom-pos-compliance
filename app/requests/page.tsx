import Link from "next/link";
import { listRecords, TABLES } from "@/lib/airtable";
import { Card } from "@/components/ui";
import RequestRow from "@/components/RequestRow";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const [requests, showrooms] = await Promise.all([
    listRecords<any>(TABLES.POS_REQUESTS, { sort: [{ field: "RequestDate", direction: "desc" }] }),
    listRecords<{ ShowroomName: string }>(TABLES.SHOWROOMS),
  ]);
  const nameById: Record<string, string> = {};
  showrooms.forEach((s) => (nameById[s.id] = s.fields.ShowroomName));

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
          + Submit New Idea
        </Link>
      </div>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom</th>
              <th>Idea</th>
              <th>Requester</th>
              <th>Urgency</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <RequestRow key={r.id} request={r} showroomName={nameById[r.fields.Showroom?.[0]] || "-"} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
