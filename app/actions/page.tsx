import Link from "next/link";
import { listRecords, TABLES } from "@/lib/airtable";
import { PriorityBadge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export default async function ActionsPage() {
  const [actionRecords, showroomRecords] = await Promise.all([
    listRecords<any>(TABLES.ACTIONS),
    listRecords<{ ShowroomName: string }>(TABLES.SHOWROOMS),
  ]);

  const showroomNameById: Record<string, string> = {};
  showroomRecords.forEach((s) => (showroomNameById[s.id] = s.fields.ShowroomName));

  const today = new Date().toISOString().slice(0, 10);
  const open = actionRecords.filter((a) => a.fields.Status === "Open" || a.fields.Status === "In Progress");

  const sorted = open.sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.fields.Priority);
    const pb = PRIORITY_ORDER.indexOf(b.fields.Priority);
    if (pa !== pb) return pa - pb;
    return (a.fields.TargetCompletionDate || "").localeCompare(b.fields.TargetCompletionDate || "");
  });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Actions Tracker</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>{open.length} open actions across the estate</p>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom</th>
              <th>Issue</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Identified</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const showroomId = a.fields.Showroom?.[0];
              const showroomName = showroomId ? showroomNameById[showroomId] : "-";
              const overdue = a.fields.TargetCompletionDate && a.fields.TargetCompletionDate < today;
              return (
                <tr key={a.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "8px 6px" }}>
                    {showroomId ? (
                      <Link href={`/showroom/${showroomId}`} style={{ color: "#E6017E", textDecoration: "none" }}>
                        {showroomName}
                      </Link>
                    ) : (
                      showroomName
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>{a.fields.IssueDescription}</td>
                  <td><PriorityBadge priority={a.fields.Priority} /></td>
                  <td>{a.fields.Status}</td>
                  <td>{a.fields.DateIdentified}</td>
                  <td style={{ color: overdue ? "#d03b3b" : undefined, fontWeight: overdue ? 600 : 400 }}>
                    {a.fields.TargetCompletionDate} {overdue ? "(overdue)" : ""}
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
