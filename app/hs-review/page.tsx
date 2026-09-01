import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRecords, TABLES } from "@/lib/airtable";
import { Card, KpiCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const HS_TEMPLATE_NAME = "H&S Walkaround";

export default async function HSReviewPage({
  searchParams,
}: {
  searchParams: { site?: string; month?: string };
}) {
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

  // Monthly log filter - "filter each store and get results that were
  // submitted that month" (Lorraine, 1 Sep 2026). Plain GET-form querystring
  // filtering (no client JS needed) - site + month, both optional, applied
  // only to the submissions table below, not the KPIs above (which stay
  // all-time so they still read as "current state of the estate").
  const selectedSiteId = searchParams.site || "";
  const selectedMonth = searchParams.month || ""; // YYYY-MM
  const filteredSubmissions = hsSubmissions.filter((s) => {
    if (selectedSiteId && s.fields.Site?.[0] !== selectedSiteId) return false;
    if (selectedMonth && !(s.fields.SubmissionDate || "").startsWith(selectedMonth)) return false;
    return true;
  });
  const hsSiteOptions = sites
    .filter((s) => (s.fields as any)["H&SChecklistApplies"] !== false)
    .slice()
    .sort((a, b) => (a.fields.SiteName || "").localeCompare(b.fields.SiteName || ""));

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>H&S Review</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        {hsSubmissions.length} H&S check{hsSubmissions.length === 1 ? "" : "s"} submitted so far.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <KpiCard label="H&S checks submitted" value={hsSubmissions.length} />
        <KpiCard label="Open follow-up actions" value={openHsActions.length} />
        <KpiCard label="Roster/poster mismatches open" value={rosterMismatches.length} />
      </div>

      <Card title={`Submissions log (${filteredSubmissions.length}${selectedSiteId || selectedMonth ? ` of ${hsSubmissions.length}` : ""})`}>
        <form method="get" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Site</label>
            <select name="site" defaultValue={selectedSiteId} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14, minWidth: 180 }}>
              <option value="">All sites</option>
              {hsSiteOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.fields.SiteName}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Month</label>
            <input type="month" name="month" defaultValue={selectedMonth} style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }} />
          </div>
          <button type="submit" style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Filter
          </button>
          {(selectedSiteId || selectedMonth) && (
            <a href="/hs-review" style={{ fontSize: 13, color: "#3348B0" }}>Clear filters</a>
          )}
        </form>
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
            {filteredSubmissions.map((s) => (
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
            {filteredSubmissions.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "16px 4px", color: "#999" }}>{selectedSiteId || selectedMonth ? "No H&S checks match this filter." : "No H&S checks submitted yet."}</td></tr>
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
