import Link from "next/link";
import { getRecord, listRecords, TABLES } from "@/lib/airtable";
import { KpiCard, RagBadge, PriorityBadge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

function esc(s: string) {
  return s.replace(/"/g, '\\"');
}

export default async function ShowroomPage({ params }: { params: { id: string } }) {
  const showroom = await getRecord<any>(TABLES.SHOWROOMS, params.id);
  const name = showroom.fields.ShowroomName;
  const filter = `SEARCH("${esc(name)}", ARRAYJOIN({Showroom})) > 0`;

  const [audits, actions] = await Promise.all([
    listRecords<any>(TABLES.AUDITS, { filterByFormula: filter, sort: [{ field: "AuditDate", direction: "desc" }] }),
    listRecords<any>(TABLES.ACTIONS, { filterByFormula: filter, sort: [{ field: "DateIdentified", direction: "desc" }] }),
  ]);

  const openActions = actions.filter((a) => a.fields.Status !== "Verified-Closed" && a.fields.Status !== "Resolved");

  return (
    <div>
      <Link href="/dashboard" style={{ color: "#6E6E6E", fontSize: 13, textDecoration: "none" }}>&larr; Back to overview</Link>
      <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>{name}</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        {showroom.fields.Region} &middot; {showroom.fields.AuditGroup} &middot; {showroom.fields.Address || "no address on file"}
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="Current score" value={showroom.fields.ComplianceScore ?? "-"} />
        <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 13, color: "#6E6E6E", marginBottom: 10 }}>RAG status</div>
          <RagBadge rag={showroom.fields.RAGStatus} />
        </div>
        <KpiCard label="Last audit" value={showroom.fields.LastAuditDate || "-"} />
        <KpiCard label="Next due" value={showroom.fields.NextAuditDue || "-"} />
        <KpiCard label="Open actions" value={openActions.length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Audit history">
          {audits.length === 0 && <p style={{ color: "#999" }}>No audits submitted yet.</p>}
          {audits.map((a) => (
            <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid #f2f2f2", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 500 }}>{a.fields.AuditDate}</div>
                <div style={{ fontSize: 12, color: "#999" }}>{a.fields.AuditType} &middot; {a.fields.CompletedByName || "unknown"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <RagBadge rag={a.fields.RAGStatus} />
                <div style={{ fontSize: 13, marginTop: 4 }}>{a.fields.OverallComplianceScore}/100</div>
              </div>
            </div>
          ))}
        </Card>

        <Card title="Actions">
          {actions.length === 0 && <p style={{ color: "#999" }}>No actions raised for this showroom.</p>}
          {actions.map((a) => (
            <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid #f2f2f2" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500 }}>{a.fields.IssueDescription}</span>
                <PriorityBadge priority={a.fields.Priority} />
              </div>
              <div style={{ fontSize: 12, color: "#999" }}>
                Status: {a.fields.Status} &middot; Target: {a.fields.TargetCompletionDate || "-"}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
