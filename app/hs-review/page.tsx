import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRecords, TABLES } from "@/lib/airtable";
import { Card, KpiCard } from "@/components/ui";
import DownloadLogPdfButton from "@/components/DownloadLogPdfButton";
import DownloadStorePdfButton from "@/components/DownloadStorePdfButton";

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
      CompletedByEmail?: string;
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
    listRecords<{
      TemplateQuestion?: string[];
      Submission?: string[];
      AnswerText?: string;
      Photo?: { id: string; filename: string }[];
    }>(TABLES.ANSWERS),
    listRecords<{ Template?: string[]; QuestionNumber?: number; QuestionText?: string; Section?: string; OrderIndex?: number }>(TABLES.TEMPLATE_QUESTIONS),
  ]);

  const hsTemplate = templates.find((t) => t.fields.TemplateName === HS_TEMPLATE_NAME);
  const hsQuestionIds = new Set(questions.filter((q) => q.fields.Template?.includes(hsTemplate?.id || "")).map((q) => q.id));
  const hsAnswerIds = new Set(answers.filter((a) => (a.fields.TemplateQuestion || []).some((qid) => hsQuestionIds.has(qid))).map((a) => a.id));

  const hsSubmissions = submissions.filter((s) => s.fields.ChecklistTemplate?.includes(hsTemplate?.id || ""));
  const hsActions = actions.filter((a) => (a.fields.SourceAnswer || []).some((aid) => hsAnswerIds.has(aid)));

  const siteName = (id?: string) => sites.find((s) => s.id === id)?.fields.SiteName || "-";

  // Action -> Answer -> TemplateQuestion join, so the Open Follow-up Actions
  // table can show which question an issue came from even when the text
  // itself is vague (Salli, 2 Sep 2026: "there is an issue that just says
  // no - I'm not sure which question that relates to"). Read-time join
  // rather than baking the question number into every IssueDescription, so
  // it also covers submissions from before this fix.
  const answerById = new Map(answers.map((a) => [a.id, a]));
  const questionById = new Map(questions.map((q) => [q.id, q.fields]));
  const questionRefFor = (action: (typeof hsActions)[number]): string | null => {
    const answerId = action.fields.SourceAnswer?.[0];
    const answer = answerId ? answerById.get(answerId) : undefined;
    const questionId = answer?.fields.TemplateQuestion?.[0];
    const question = questionId ? questionById.get(questionId) : undefined;
    if (!question) return null;
    return question.QuestionNumber ? `Q${question.QuestionNumber}` : question.QuestionText ? question.QuestionText.slice(0, 40) : null;
  };

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

  // "make the results download to pdf so if salli ever needs to do this
  // she can" (Lorraine, 1 Sep 2026) - PDF export of whatever's currently
  // filtered, via DownloadLogPdfButton (client-side jsPDF, see that file).
  const filterDescription = selectedSiteId || selectedMonth
    ? `${selectedSiteId ? siteName(selectedSiteId) : "All sites"} - ${selectedMonth || "all time"}`
    : "All sites - all time";
  const pdfRows = filteredSubmissions.map((s) => ({
    site: siteName(s.fields.Site?.[0]),
    date: s.fields.SubmissionDate || "",
    completedBy: s.fields.CompletedByName || "",
    status: s.fields.Status || "",
  }));

  // "One combined PDF per store (all its submissions)" (Lorraine, 2 Sep
  // 2026) - every H&S Check the selected site has EVER submitted, full Q&A
  // each, in one file. Deliberately all-time regardless of the Month filter
  // above (that filter is for the on-screen log/table only) - only appears
  // once a specific site is chosen, since "all its submissions" needs one
  // site to mean anything.
  let storePdfSubmissions: import("@/components/DownloadStorePdfButton").StorePdfSubmission[] = [];
  if (selectedSiteId) {
    const questionById = new Map(questions.map((q) => [q.id, q.fields]));
    const siteSubmissions = hsSubmissions
      .filter((s) => s.fields.Site?.[0] === selectedSiteId)
      .slice()
      .sort((a, b) => (a.fields.SubmissionDate || "").localeCompare(b.fields.SubmissionDate || "")); // oldest first, reads chronologically

    storePdfSubmissions = siteSubmissions.map((s) => {
      const subAnswers = answers
        .filter((a) => a.fields.Submission?.includes(s.id))
        .map((a) => ({ ...a.fields, question: questionById.get(a.fields.TemplateQuestion?.[0] || "") }))
        .filter((a) => a.question)
        .sort((a, b) => (a.question!.OrderIndex || 0) - (b.question!.OrderIndex || 0));

      const bySection = new Map<string, typeof subAnswers>();
      subAnswers.forEach((a) => {
        const section = a.question!.Section || "";
        if (!bySection.has(section)) bySection.set(section, []);
        bySection.get(section)!.push(a);
      });

      return {
        submissionDate: s.fields.SubmissionDate || "",
        completedByName: s.fields.CompletedByName || "",
        completedByEmail: s.fields.CompletedByEmail || "",
        status: s.fields.Status || "",
        sections: Array.from(bySection.entries()).map(([section, items]) => ({
          section,
          items: items.map((a) => ({
            qnum: a.question!.QuestionNumber ?? null,
            text: a.question!.QuestionText || "",
            answerText: a.AnswerText || "",
            hasPhotos: (a.Photo || []).length > 0,
          })),
        })),
      };
    });
  }

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

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h3 style={{ marginTop: 0, marginBottom: 0, fontSize: 16 }}>
            Submissions log ({filteredSubmissions.length}{selectedSiteId || selectedMonth ? ` of ${hsSubmissions.length}` : ""})
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <DownloadLogPdfButton rows={pdfRows} filterDescription={filterDescription} />
            {selectedSiteId && (
              <DownloadStorePdfButton siteName={siteName(selectedSiteId)} submissions={storePdfSubmissions} />
            )}
          </div>
        </div>
        <form method="get" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 16, marginBottom: 16 }}>
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
              <th>Question</th>
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
                <td style={{ color: "#6E6E6E", whiteSpace: "nowrap" }}>{questionRefFor(a) || "-"}</td>
                <td>{a.fields.IssueDescription}</td>
                <td>{a.fields.Priority}</td>
                <td>{a.fields.DateIdentified}</td>
                <td>{(a.fields.RosterMismatch || []).length > 0 ? "Roster/poster" : "Reported issue"}</td>
              </tr>
            ))}
            {openHsActions.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "16px 4px", color: "#999" }}>Nothing open.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
