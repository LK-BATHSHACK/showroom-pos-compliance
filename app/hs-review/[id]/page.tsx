import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listRecords, getRecord, TABLES } from "@/lib/airtable";
import { Card } from "@/components/ui";
import DownloadSubmissionPdfButton from "@/components/DownloadSubmissionPdfButton";

export const dynamic = "force-dynamic";

export default async function HSSubmissionDetailPage({ params }: { params: { id: string } }) {
  const session = await requireRole(["Admin", "Marketing", "H&S"]);
  if (!session) redirect("/dashboard");

  let submission;
  try {
    submission = await getRecord<{
      SubmissionName: string;
      Site?: string[];
      SubmissionDate?: string;
      CompletedByName?: string;
      CompletedByEmail?: string;
      Status?: string;
    }>(TABLES.SUBMISSIONS, params.id);
  } catch {
    notFound();
  }

  const [sites, allAnswers, allQuestions] = await Promise.all([
    listRecords<{ SiteName: string }>(TABLES.SITES),
    listRecords<{
      Submission?: string[];
      TemplateQuestion?: string[];
      AnswerText?: string;
      Photo?: { id: string; filename: string; url?: string; size?: number; thumbnails?: { small?: { url: string } } }[];
    }>(TABLES.ANSWERS),
    listRecords<{ QuestionText: string; Section?: string; OrderIndex?: number; QuestionNumber?: number }>(TABLES.TEMPLATE_QUESTIONS),
  ]);

  const questionById: Record<string, (typeof allQuestions)[number]["fields"]> = {};
  allQuestions.forEach((q) => (questionById[q.id] = q.fields));

  const answers = allAnswers
    .filter((a) => a.fields.Submission?.includes(params.id))
    .map((a) => ({
      id: a.id,
      text: a.fields.AnswerText || "",
      photos: a.fields.Photo || [],
      question: questionById[a.fields.TemplateQuestion?.[0] || ""],
    }))
    .filter((a) => a.question)
    .sort((a, b) => (a.question.OrderIndex || 0) - (b.question.OrderIndex || 0));

  const bySection = new Map<string, typeof answers>();
  answers.forEach((a) => {
    const section = a.question.Section || "";
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push(a);
  });

  const siteName = sites.find((s) => s.id === submission.fields.Site?.[0])?.fields.SiteName || "-";

  const pdfSections = Array.from(bySection.entries()).map(([section, items]) => ({
    section,
    items: items.map((a) => ({
      qnum: a.question.QuestionNumber ?? null,
      text: a.question.QuestionText,
      answerText: a.text,
      hasPhotos: a.photos.length > 0,
    })),
  }));

  return (
    <div>
      <Link href="/hs-review" style={{ color: "#3348B0", fontSize: 13 }}>&larr; Back to H&S Review</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 8, marginBottom: 4, gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>{siteName} - {submission.fields.SubmissionDate}</h1>
        <DownloadSubmissionPdfButton
          siteName={siteName}
          submissionDate={submission.fields.SubmissionDate || ""}
          completedByName={submission.fields.CompletedByName || ""}
          completedByEmail={submission.fields.CompletedByEmail || ""}
          status={submission.fields.Status || ""}
          sections={pdfSections}
        />
      </div>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Completed by {submission.fields.CompletedByName} ({submission.fields.CompletedByEmail}) - {submission.fields.Status}
      </p>

      {Array.from(bySection.entries()).map(([section, items]) => (
        <div key={section} style={{ marginBottom: 20 }}>
          <Card title={section}>
            {items.map((a) => (
              <div key={a.id} style={{ marginBottom: 14, borderBottom: "1px solid #f2f2f2", paddingBottom: 10 }}>
                <div style={{ fontSize: 13, color: "#6E6E6E", marginBottom: 2 }}>
                  {a.question.QuestionNumber ? `Q${a.question.QuestionNumber}. ` : ""}{a.question.QuestionText}
                </div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{a.text || <span style={{ color: "#999" }}>No answer</span>}</div>
                {a.photos.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {a.photos.map((p) =>
                      p.url ? (
                        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.filename}>
                          <img
                            src={p.thumbnails?.small?.url || p.url}
                            alt={p.filename}
                            style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid #eee" }}
                          />
                        </a>
                      ) : (
                        // Preview-mode mock attachments have no real URL to link to.
                        <span key={p.id} style={{ fontSize: 12, background: "#F7F7F8", borderRadius: 6, padding: "6px 10px" }}>
                          📎 {p.filename}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
