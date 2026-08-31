import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRecords, TABLES } from "@/lib/airtable";
import { Card, KpiCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const HS_TEMPLATE_NAME = "H&S Walkaround";

export default async function HSReviewPage() {
  const session = await requireRole(["Admin", "Marketing", "H&S"]);
  if (!session) redirect("/dashboard");

  const [templates, submissions, sites, actions, answers, questions] = await Promise.all([
    listRecords<{ TemplateName: string }>(TABLES.CHECKLIST_TEMPLATES),
    listRecords<{
      SubmissionName: string;
      Site?: string[];
      ChecklistTemplate?: string[];
      SubmissionDate?: string;
      CompletedByName?: string;
      Status?: string;
    }>(TABLES.SUBMISSIONS, { sort: [{ field: "SubmissionDate", direction: "desc" }] }),
    listRecords<{ SiteName: string }>(TABLES.SITES),
    listRecords<{
      Status?: string;
      Site?: string[];
      SourceAnswer?: string[];
      RosterMismatch?: string[];
      IssueDescription?: string;
      Priority?: string;
      DateIdentified?: string;
    }>(TABLES.ACTIONS),
    listRecords<{ TemplateQuestion?: string[]; Submission?: string[] }>(TABLES.ANSWERS),
    listRecords<{ Template?: string[] }>(TABLES.TEMPLATE_QUESTIONS),
  ]);

  const hsTemplate = templates.find((t) => t.fields.TemplateName === HS_TEMPLATE_NAME);
  const hsQuestionIds = new Set(questions.filter((q) => q.fields.Template?.includes(hsTemplate?.id || "")).map((q) => q.id));
  const hsAnswerIds = new Set(answers.filter((a) => (a.fields.TemplateQuestion || []).some((qid) => hsQuestionIds.has(qid))).map((a) => a.id));

  const hsSubmissions = submissions.filter((s) => s.fields.ChecklistTemplate?.includes(hsTemplate?.id || ""));
  const hsActions = actions.filter((a) => (a.fields.SourceAnswer || []).some((aid) => hsAnswerIds.has(aid)));

  const siteName = (id?: string) => sites.find((s) => s.id === id)?.fields.SiteName || "-";

  const openHsActions = hsActions.filter((a) => a.fields.Status === "Open" || a.fields.Status === "In progress");
  const rosterMismatches = openHsActions.filter((a) => (a.fields.RosterMismatch || []).length > 0);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>H&S Review</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        {hsSubmissions.length} walkaround{hsSubmissions.length === 1 ? "" : "s"} submitted so far.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="Walkarounds submitted" value={hsSubmissions.length} />
        <KpiCard label="Open follow-up actions" value={openHsActions.length} />
        <KpiCard label="Roster/poster mismatches open" value={rosterMismatches.length} />
      </div>

      <Card title="Recent submissions">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "6px 4px" }}>Site</th>
              <th>Date</th>
              <th>Completed by</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hsSubmissions.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                <td style={{ padding: "8px 4px" }}>{siteName(s.fields.Site?.[0])}</td>
                <td>{s.fields.SubmissionDate}</td>
                <td>{s.fields.CompletedByName}</td>
                <td>{s.fields.Status}</td>
                <td>
                  <Link href={`/hs-review/${s.id}`} style={{ color: "#3348B0", fontSize: 13 }}>View answers</Link>
                </td>
              </tr>
            ))}
            {hsSubmissions.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "16px 4px", color: "#999" }}>No H&S Walkarounds submitted yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`Open follow-up actions (${openHsActions.length})`}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "6px 4px" }}>Site</th>
              <th>Issue</th>
              <th>Priority</th>
              <th>Identified</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {openHsActions.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                <td style={{ padding: "8px 4px" }}>{siteName(a.fields.Site?.[0])}</td>
                <td>{a.fields.IssueDescription}</td>
                <td>{a.fields.Priority}</td>
                <td>{a.fields.DateIdentified}</td>
                <td>{(a.fields.RosterMismatch || []).length > 0 ? "Roster/poster" : "Reported issue"}</td>
              </tr>
            ))}
            {openHsActions.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "16px 4px", color: "#999" }}>Nothing open.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
