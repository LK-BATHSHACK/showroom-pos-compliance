import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRecords, TABLES } from "@/lib/airtable";
import { Card, KpiCard } from "@/components/ui";
import DownloadLogPdfButton from "@/components/DownloadLogPdfButton";
import DownloadStorePdfButton from "@/components/DownloadStorePdfButton";
import HSOpenActionsTable, { HSOpenActionRow } from "@/components/HSOpenActionsTable";
import HSReviewTabs from "@/components/HSReviewTabs";
import ShowroomScoresPanel from "@/components/ShowroomScoresPanel";
import HSKeyDatesPanel, { type KeyDatesRow } from "@/components/HSKeyDatesPanel";

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
      UrgencyClass?: string;
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
  // "2026-09" -> "September 2026", for the KPI card's sub-label.
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return ym;
    return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  };

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
  // Same join, just the Section instead of the question number/text - powers
  // the Section filter on the Open follow-up actions table below (Salli, 9
  // Sep 2026: "whatever way the questions are sectioned off could be the
  // filters").
  const sectionRefFor = (action: (typeof hsActions)[number]): string | null => {
    const answerId = action.fields.SourceAnswer?.[0];
    const answer = answerId ? answerById.get(answerId) : undefined;
    const questionId = answer?.fields.TemplateQuestion?.[0];
    const question = questionId ? questionById.get(questionId) : undefined;
    return question?.Section || null;
  };
  // Same join again, just the raw question number - powers the Showroom
  // Scores "recurring issue" check below (Salli, 10 Sep 2026: RED should
  // include "something that has been brought to our attention in 2
  // consecutive checklists (and hasn't been resolved)" - matched by which
  // question raised it, same site, this month vs last month).
  const questionNumberFor = (action: (typeof hsActions)[number]): number | null => {
    const answerId = action.fields.SourceAnswer?.[0];
    const answer = answerId ? answerById.get(answerId) : undefined;
    const questionId = answer?.fields.TemplateQuestion?.[0];
    const question = questionId ? questionById.get(questionId) : undefined;
    return question?.QuestionNumber ?? null;
  };

  // "Added to Maintenance Planner" counts as still-open here (10 Sep 2026) -
  // it's a part-close, not a close, so it should keep showing as an open
  // follow-up action until someone marks it properly Resolved.
  const openHsActions = hsActions.filter(
    (a) => a.fields.Status === "Open" || a.fields.Status === "In progress" || a.fields.Status === "Added to Maintenance Planner"
  );
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

  const reviewContent = (
    <>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        {hsSubmissions.length} H&S check{hsSubmissions.length === 1 ? "" : "s"} submitted so far.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Zara, 9 Sep 2026: "is that 'this month' or is that total in all
            time? It would be useful if it can be filtered per month? So Zara
            can give the exact amount of submissions that month." - this
            previously always showed the all-time total regardless of the
            Site/Month filter below (which only ever touched the Submissions
            Log table). Now it tracks the same filter, with a sub-label
            spelling out exactly what's being counted so there's no more
            ambiguity either way. */}
        <KpiCard
          label="H&S checks submitted"
          value={filteredSubmissions.length}
          sub={selectedSiteId || selectedMonth ? `${selectedMonth ? monthLabel(selectedMonth) : "all time"}${selectedSiteId ? ` · ${siteName(selectedSiteId)}` : ""}` : "all time - use the filter below for a specific month"}
        />
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
        <HSOpenActionsTable
          rows={openHsActions.map(
            (a): HSOpenActionRow => ({
              id: a.id,
              site: siteName(a.fields.Site?.[0]),
              questionRef: questionRefFor(a) || "",
              section: sectionRefFor(a),
              issue: a.fields.IssueDescription || "",
              priority: a.fields.Priority || "",
              identified: a.fields.DateIdentified || "",
              typeLabel: (a.fields.RosterMismatch || []).length > 0 ? "Roster/poster" : "Reported issue",
            })
          )}
        />
      </Card>
    </>
  );

  const scoresContent = (
    <ShowroomScoresPanel
      sites={hsSiteOptions.map((s) => ({ id: s.id, name: s.fields.SiteName }))}
      submissions={hsSubmissions.map((s) => ({ siteId: s.fields.Site?.[0] || "", date: s.fields.SubmissionDate || "" }))}
      actions={hsActions.map((a) => ({
        siteId: a.fields.Site?.[0] || "",
        dateIdentified: a.fields.DateIdentified || "",
        status: a.fields.Status || "",
        urgencyClass: a.fields.UrgencyClass,
        questionNumber: questionNumberFor(a),
      }))}
    />
  );

  // Key Dates tab - each site's latest H&S check, pulling the answers to
  // Q38 (extinguisher service), Q67 (next fire drill) and Q47 (first aid
  // kit expiry). hsSubmissions is already sorted newest first.
  const hsQuestionIdByQnum = new Map<number, string>();
  questions.forEach((q) => {
    if (q.fields.Template?.includes(hsTemplate?.id || "") && q.fields.QuestionNumber) hsQuestionIdByQnum.set(q.fields.QuestionNumber, q.id);
  });
  const answerFor = (submissionId: string, qnum: number): string | null => {
    const qid = hsQuestionIdByQnum.get(qnum);
    if (!qid) return null;
    const a = answers.find((x) => x.fields.Submission?.includes(submissionId) && x.fields.TemplateQuestion?.includes(qid));
    return a?.fields.AnswerText?.trim() || null;
  };
  const keyDatesRows: KeyDatesRow[] = hsSiteOptions.map((site) => {
    const latest = hsSubmissions.find((s) => s.fields.Site?.[0] === site.id);
    return {
      siteId: site.id,
      siteName: site.fields.SiteName,
      latestSubmissionId: latest?.id || null,
      latestSubmissionDate: latest?.fields.SubmissionDate || null,
      extinguisherService: latest ? answerFor(latest.id, 38) : null,
      nextFireDrill: latest ? answerFor(latest.id, 67) : null,
      firstAidKitExpiry: latest ? answerFor(latest.id, 47) : null,
    };
  });
  const todayLondon = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>H&S Review</h1>
      <HSReviewTabs
        reviewContent={reviewContent}
        scoresContent={scoresContent}
        keyDatesContent={<HSKeyDatesPanel rows={keyDatesRows} today={todayLondon} />}
      />
    </div>
  );
}
