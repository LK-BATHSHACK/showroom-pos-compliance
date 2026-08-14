import Link from "next/link";
import { listRecords, TABLES } from "@/lib/airtable";
import { KpiCard, RagBadge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

type ShowroomFields = {
  ShowroomName: string;
  Region: string;
  AuditGroup: string;
  ComplianceScore?: number;
  RAGStatus?: string;
  SupportTier?: string;
  LastAuditDate?: string;
  NextAuditDue?: string;
  Active?: boolean;
};

type ActionFields = {
  Status: string;
  Priority: string;
};

export default async function DashboardPage() {
  const [showroomRecords, actionRecords] = await Promise.all([
    listRecords<ShowroomFields>(TABLES.SHOWROOMS),
    listRecords<ActionFields>(TABLES.ACTIONS),
  ]);

  const showrooms = showroomRecords.filter((r) => r.fields.Active !== false);
  const today = new Date().toISOString().slice(0, 10);

  const scored = showrooms.filter((s) => typeof s.fields.ComplianceScore === "number");
  const avgScore = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + (s.fields.ComplianceScore || 0), 0) / scored.length) * 10) / 10
    : null;

  const ragCounts = { Green: 0, Amber: 0, Red: 0, "No data": 0 };
  showrooms.forEach((s) => {
    const rag = s.fields.RAGStatus as keyof typeof ragCounts;
    if (rag && ragCounts[rag] !== undefined) ragCounts[rag]++;
    else ragCounts["No data"]++;
  });

  const overdue = showrooms.filter((s) => s.fields.NextAuditDue && s.fields.NextAuditDue < today);

  const openActions = actionRecords.filter((a) => a.fields.Status === "Open" || a.fields.Status === "In Progress");
  const criticalHighOpen = openActions.filter((a) => a.fields.Priority === "Critical" || a.fields.Priority === "High").length;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Executive Overview</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        {showrooms.length} active showrooms · updated live from Airtable
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="Estate avg. compliance score" value={avgScore ?? "-"} sub={avgScore !== null ? "/ 100" : "no audits yet"} />
        <KpiCard label="Fully compliant (Green)" value={ragCounts.Green} sub={`of ${showrooms.length} showrooms`} />
        <KpiCard label="Needs attention (Amber/Red)" value={ragCounts.Amber + ragCounts.Red} sub={`${ragCounts.Red} Red`} />
        <KpiCard label="Overdue for audit" value={overdue.length} />
        <KpiCard label="Open actions (Critical/High)" value={criticalHighOpen} sub={`${openActions.length} open in total`} />
      </div>

      <Card title="Showrooms">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom</th>
              <th>Region</th>
              <th>Group</th>
              <th>RAG</th>
              <th>Score</th>
              <th>Last audit</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {showrooms
              .sort((a, b) => a.fields.ShowroomName.localeCompare(b.fields.ShowroomName))
              .map((s) => {
                const isOverdue = s.fields.NextAuditDue && s.fields.NextAuditDue < today;
                return (
                  <tr key={s.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                    <td style={{ padding: "8px 6px" }}>
                      <Link href={`/showroom/${s.id}`} style={{ color: "#E6017E", textDecoration: "none", fontWeight: 500 }}>
                        {s.fields.ShowroomName}
                      </Link>
                    </td>
                    <td>{s.fields.Region}</td>
                    <td>{s.fields.AuditGroup}</td>
                    <td><RagBadge rag={s.fields.RAGStatus} /></td>
                    <td>{s.fields.ComplianceScore ?? "-"}</td>
                    <td>{s.fields.LastAuditDate || "-"}</td>
                    <td style={{ color: isOverdue ? "#d03b3b" : undefined, fontWeight: isOverdue ? 600 : 400 }}>
                      {s.fields.NextAuditDue || "-"} {isOverdue ? "(overdue)" : ""}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
