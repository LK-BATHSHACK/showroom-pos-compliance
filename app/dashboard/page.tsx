import Link from "next/link";
import { listRecords, TABLES } from "@/lib/airtable";
import { computeHSSiteScores, estateHSAverage } from "@/lib/hsSubmission";
import { KpiCard, RagBadge, AuditTypeBadge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const HS_TEMPLATE_NAME = "H&S Walkaround";

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
  SourceAnswer?: string[];
  SourceAuditLineItem?: string[];
};

export default async function DashboardPage() {
  const [
    showroomRecords,
    actionRecords,
    auditRecords,
    siteRecords,
    templateRecords,
    questionRecords,
    hsSubmissionRecords,
    hsAnswerRecords,
  ] = await Promise.all([
    listRecords<ShowroomFields>(TABLES.SHOWROOMS),
    listRecords<ActionFields>(TABLES.ACTIONS),
    listRecords<{ Showroom?: string[]; AuditType?: string; AuditDate?: string }>(TABLES.AUDITS, {
      sort: [{ field: "AuditDate", direction: "desc" }],
    }),
    listRecords<{ SiteName: string; Active?: boolean; "H&SChecklistApplies"?: boolean }>(TABLES.SITES),
    listRecords<{ TemplateName: string }>(TABLES.CHECKLIST_TEMPLATES),
    listRecords<{ Template?: string[] }>(TABLES.TEMPLATE_QUESTIONS),
    listRecords<{ Site?: string[]; SubmissionDate?: string; ChecklistTemplate?: string[] }>(TABLES.SUBMISSIONS),
    listRecords<{ TemplateQuestion?: string[]; Submission?: string[] }>(TABLES.ANSWERS),
  ]);

  // H&S: same Template -> Template Questions -> Answers -> Actions tracing
  // hs-review/page.tsx uses, so this stays correct regardless of what other
  // checklist types get added to the shared Submissions/Answers tables later.
  const hsTemplate = templateRecords.find((t) => t.fields.TemplateName === HS_TEMPLATE_NAME);
  const hsQuestionIds = new Set(questionRecords.filter((q) => q.fields.Template?.includes(hsTemplate?.id || "")).map((q) => q.id));
  const hsAnswers = hsAnswerRecords.filter((a) => (a.fields.TemplateQuestion || []).some((qid) => hsQuestionIds.has(qid)));
  const hsAnswerIds = new Set(hsAnswers.map((a) => a.id));
  const hsSubmissions = hsSubmissionRecords.filter((s) => s.fields.ChecklistTemplate?.includes(hsTemplate?.id || ""));
  const hsActions = actionRecords.filter((a) => (a.fields.SourceAnswer || []).some((aid) => hsAnswerIds.has(aid)));
  const hsSites = siteRecords.filter((s) => s.fields.Active !== false && s.fields["H&SChecklistApplies"]);

  const hsSiteScores = computeHSSiteScores(
    hsSites.map((s) => ({ id: s.id, name: s.fields.SiteName })),
    hsSubmissions,
    hsAnswers,
    hsActions
  );
  const hsAvgScore = estateHSAverage(hsSiteScores);
  const hsNotYetWalked = hsSiteScores.filter((s) => s.score === null).length;
  const hsOpenActions = hsActions.filter((a) => a.fields.Status === "Open" || a.fields.Status === "In progress");

  const showrooms = showroomRecords.filter((r) => r.fields.Active !== false);
  const today = new Date().toISOString().slice(0, 10);

  // Most recent audit per showroom, so the table can show which type of
  // check (Jordan's physical spot check / self-report / remote checklist)
  // produced the current score - sorted desc above, so the first match per
  // showroom is the latest.
  const lastAuditTypeByShowroom: Record<string, string> = {};
  auditRecords.forEach((a) => {
    const showroomId = a.fields.Showroom?.[0];
    if (showroomId && !(showroomId in lastAuditTypeByShowroom)) {
      lastAuditTypeByShowroom[showroomId] = a.fields.AuditType || "";
    }
  });

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

  // POS-only, now that Actions also holds H&S rows - same
  // SourceAuditLineItem-present-means-POS discriminator used on the Actions
  // tab, so this KPI isn't silently inflated by H&S findings.
  const posActions = actionRecords.filter((a) => (a.fields.SourceAuditLineItem || []).length > 0);
  const openActions = posActions.filter((a) => a.fields.Status === "Open" || a.fields.Status === "In progress");
  const criticalHighOpen = openActions.filter((a) => a.fields.Priority === "Critical" || a.fields.Priority === "High").length;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Executive Overview</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        {showrooms.length} active showrooms · {scored.length} POS-audited · {hsSiteScores.length - hsNotYetWalked} H&amp;S-walked · updated live from Airtable
      </p>

      <h2 style={{ fontSize: 15, textTransform: "uppercase", letterSpacing: 0.5, color: "#6E6E6E", marginBottom: 10 }}>POS Compliance</h2>
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <KpiCard label="Estate avg. compliance score" value={avgScore ?? "-"} sub={avgScore !== null ? `/ 100, across ${scored.length} audited` : "no audits yet"} />
        <KpiCard label="Fully compliant (Green)" value={ragCounts.Green} sub={`of ${showrooms.length} showrooms`} />
        <KpiCard label="Needs attention (Amber/Red)" value={ragCounts.Amber + ragCounts.Red} sub={`${ragCounts.Red} Red`} />
        <KpiCard label="Not yet audited" value={ragCounts["No data"]} sub={`of ${showrooms.length} showrooms`} />
        <KpiCard label="Overdue for audit" value={overdue.length} />
        <KpiCard label="Open actions (Critical/High)" value={criticalHighOpen} sub={`${openActions.length} open in total`} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, textTransform: "uppercase", letterSpacing: 0.5, color: "#6E6E6E", margin: 0 }}>Health &amp; Safety</h2>
        <Link href="/hs-review" style={{ color: "#3348B0", fontSize: 13, textDecoration: "none" }}>View H&amp;S Review →</Link>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <KpiCard
          label="Estate avg. H&S pass rate"
          value={hsAvgScore ?? "-"}
          sub={hsAvgScore !== null ? `/ 100, across ${hsSiteScores.length - hsNotYetWalked} walked` : "no walkarounds yet"}
        />
        <KpiCard label="Not yet walked around" value={hsNotYetWalked} sub={`of ${hsSiteScores.length} sites`} />
        <KpiCard label="Open H&S actions" value={hsOpenActions.length} />
      </div>
      <p style={{ color: "#999", fontSize: 12, marginTop: -18, marginBottom: 28 }}>
        Kept as a separate score from POS on purpose - H&amp;S is pass/fail with escalation, not a weighted 100pt score, so it isn&apos;t blended into the POS number above.
      </p>

      <Card title="Showrooms">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom</th>
              <th>Region</th>
              <th>Group</th>
              <th>RAG</th>
              <th>Score</th>
              <th>Last audit type</th>
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
                    <td>{lastAuditTypeByShowroom[s.id] ? <AuditTypeBadge auditType={lastAuditTypeByShowroom[s.id]} /> : "-"}</td>
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
