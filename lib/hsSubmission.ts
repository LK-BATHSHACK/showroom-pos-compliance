// H&S Walkaround submission flow - the second checklist type on the
// generalised Sites/Checklist Templates/Template Questions/Submissions/
// Answers/Actions/Rosters schema (see "Showroom Compliance Tool -
// Generalisation Architecture Proposal.md" in the Team Planning project).
//
// This does NOT touch POS's tables or processAuditSubmission.ts - it is
// entirely additive, same principle as the data migration.

import { listRecords, createRecords, uploadAttachment, TABLES, type AttachmentUpload } from "./airtable";
import { sendEmail, emailShell, BRAND } from "./resend";

export type AnswerType =
  | "Short answer"
  | "Long answer"
  | "Date"
  | "Single choice"
  | "Yes/No"
  | "Matrix"
  | "Multiple choice (checkboxes)"
  | "File upload";

export type TemplateQuestion = {
  id: string;
  qnum: number | null;
  section: string;
  order: number;
  text: string;
  answerType: AnswerType;
  options: string[]; // parsed from OptionsNotes, semicolon-separated
  optionsRaw: string | null;
  required: boolean;
  scopeType: "AllSites" | "SiteType" | "NamedSites";
  scopeSiteType: string | null;
  scopeSiteNames: string[];
  rosterRole: "H&S Rep" | "Mental Health First Aider" | "Emergency Contact" | null;
  urgency: "Digest" | "Immediate";
};

export type SiteOption = {
  id: string;
  name: string;
  siteType: string | null;
  region: "NI" | "ROI" | "GB" | null;
};

export type RosterRow = {
  id: string;
  role: string;
  region: string | null;
  names: string;
  templateQuestionIds: string[];
};

const HS_TEMPLATE_NAME = "H&S Walkaround";

// Q3 ("Site being inspected") is answered implicitly by the site-selection
// step of this flow, not rendered as a form question - see submission page.
const SKIPPED_QUESTION_NUMBERS = new Set([3]);

function splitOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function fetchSites(): Promise<SiteOption[]> {
  const records = await listRecords<{ SiteName: string; SiteType?: string; Region?: string; Active?: boolean }>(TABLES.SITES);
  return records
    .filter((r) => r.fields.Active !== false)
    .map((r) => ({
      id: r.id,
      name: r.fields.SiteName,
      siteType: r.fields.SiteType || null,
      region: (r.fields.Region as any) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchHSQuestions(): Promise<TemplateQuestion[]> {
  const [templates, questions] = await Promise.all([
    listRecords<{ TemplateName: string }>(TABLES.CHECKLIST_TEMPLATES),
    listRecords<{
      QuestionText: string;
      Template?: string[];
      Section?: string;
      OrderIndex?: number;
      QuestionNumber?: number;
      AnswerType?: string;
      OptionsNotes?: string;
      Required?: boolean;
      ScopeType?: string;
      ScopeSiteType?: string;
      ScopeSites?: string[];
      RosterRole?: string;
      UrgencyClass?: string;
    }>(TABLES.TEMPLATE_QUESTIONS),
  ]);

  const hsTemplate = templates.find((t) => t.fields.TemplateName === HS_TEMPLATE_NAME);
  if (!hsTemplate) throw new Error(`Checklist Template "${HS_TEMPLATE_NAME}" not found.`);

  // ScopeSites is a linked-record field (record IDs), but we need it as
  // Site *names* to compare against the chosen site's name at render time -
  // resolve once here rather than per-question.
  const sites = await listRecords<{ SiteName: string }>(TABLES.SITES);
  const siteNameById: Record<string, string> = {};
  sites.forEach((s) => (siteNameById[s.id] = s.fields.SiteName));

  return questions
    .filter((q) => q.fields.Template?.includes(hsTemplate.id))
    .filter((q) => !SKIPPED_QUESTION_NUMBERS.has(q.fields.QuestionNumber || -1))
    .map((q) => ({
      id: q.id,
      qnum: q.fields.QuestionNumber ?? null,
      section: q.fields.Section || "",
      order: q.fields.OrderIndex ?? 0,
      text: q.fields.QuestionText,
      answerType: (q.fields.AnswerType as AnswerType) || "Short answer",
      options: splitOptions(q.fields.OptionsNotes),
      optionsRaw: q.fields.OptionsNotes || null,
      required: !!q.fields.Required,
      scopeType: (q.fields.ScopeType as any) || "AllSites",
      scopeSiteType: q.fields.ScopeSiteType || null,
      scopeSiteNames: (q.fields.ScopeSites || []).map((id) => siteNameById[id]).filter(Boolean),
      rosterRole: (q.fields.RosterRole as any) || null,
      urgency: (q.fields.UrgencyClass as any) || "Digest",
    }))
    .sort((a, b) => a.order - b.order);
}

/** Filters the full H&S question set down to the ones that actually apply at a given site (scope rules from the architecture doc: AllSites / SiteType / NamedSites). */
export function scopeQuestionsForSite(questions: TemplateQuestion[], site: SiteOption): TemplateQuestion[] {
  return questions.filter((q) => {
    if (q.scopeType === "AllSites") return true;
    if (q.scopeType === "SiteType") return q.scopeSiteType === site.siteType;
    if (q.scopeType === "NamedSites") return q.scopeSiteNames.includes(site.name);
    return true;
  });
}

export async function fetchRosters(): Promise<RosterRow[]> {
  const records = await listRecords<{ Role: string; Region?: string; Names: string; TemplateQuestions?: string[] }>(TABLES.ROSTERS);
  return records.map((r) => ({
    id: r.id,
    role: r.fields.Role,
    region: r.fields.Region || null,
    names: r.fields.Names,
    templateQuestionIds: r.fields.TemplateQuestions || [],
  }));
}

// ---------------------------------------------------------------------------
// Roster verification - only the 3 questions that have a real canonical list
// to check against (Q11 H&S Rep, Q51 Mental Health First Aider, Q58
// Emergency Contact). Fire Warden/First Aider (Q31/Q41/Q43) are deliberately
// open free-text questions, not checked here - see Rosters table notes.
// ---------------------------------------------------------------------------

export type RosterCheckResult = { mismatch: boolean; note: string } | null;

function checkQ11(answer: string): RosterCheckResult {
  if (!answer) return null;
  if (answer.startsWith("Yes")) return { mismatch: false, note: "" };
  return { mismatch: true, note: "H&S Reps poster reported as needing replacement/update." };
}

function checkQ51(answer: string): RosterCheckResult {
  if (!answer) return null;
  if (answer.startsWith("I've had a new poster sent to me with the correct names")) return { mismatch: false, note: "" };
  return { mismatch: true, note: "Mental Health First Aider poster reported as missing or out of date." };
}

function checkQ58(answer: string, site: SiteOption): RosterCheckResult {
  if (!answer) return null;
  if (answer.startsWith("WAREHOUSE - Not Required")) return null;
  if (answer.startsWith("No,")) {
    return { mismatch: true, note: "Emergency Contacts poster reported as missing." };
  }
  const hasNI = answer.includes("Julia, Ryan and Ruaidhri");
  const hasROI = answer.includes("Gavin, Ryan and Ruaidhri");
  if (site.region === "GB") {
    // The form's own options don't cover a GB variant (Clint Heaton) at all -
    // known gap, confirmed 31 Aug 2026 - so any answer here is a mismatch
    // until the form is updated with a GB option.
    return { mismatch: true, note: "GB site: form has no Emergency Contacts option for GB (should show Clint Heaton) - flagging until the poster/form is updated." };
  }
  if (site.region === "NI" && hasROI) {
    return { mismatch: true, note: "NI site is showing the ROI Emergency Contacts poster (Gavin/Ryan/Ruaidhri) - should be Julia/Ryan/Ruaidhri." };
  }
  if (site.region === "ROI" && hasNI) {
    return { mismatch: true, note: "ROI site is showing the NI Emergency Contacts poster (Julia/Ryan/Ruaidhri) - should be Gavin/Ryan/Ruaidhri." };
  }
  return { mismatch: false, note: "" };
}

const ROSTER_CHECKS: Record<number, (answer: string, site: SiteOption) => RosterCheckResult> = {
  11: (a) => checkQ11(a),
  51: (a) => checkQ51(a),
  58: (a, site) => checkQ58(a, site),
};

// ---------------------------------------------------------------------------
// "Report an issue" free-text fields - the form's own explicit issue-capture
// questions. Answered with real text (not blank / "n/a") => a tracked Action.
// This is deliberately narrower than "infer an issue from every answer" -
// see the architecture note in app/hs-walkaround: auto-Action-creation only
// covers roster mismatches + these explicit fields + the two training/risk-
// assessment request questions; every other answer is still fully visible
// on the H&S Review page for Salli/Marketing/Admin to act on by hand.
// ---------------------------------------------------------------------------

const ISSUE_FIELD_QUESTION_NUMBERS = new Set([4, 9, 13, 15, 17, 26, 40, 50, 57, 61]);

function isBlankOrNA(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "" || t === "n/a" || t === "na" || t === "none";
}

export type AnswerInput = {
  questionId: string;
  value: string; // for Matrix, a JSON-stringified {subQuestion: answer} map; for Multiple choice, semicolon-joined selections
};

export type SubmissionInput = {
  siteId: string;
  submittedByName: string;
  submittedByEmail: string;
  answers: AnswerInput[];
  // Photos for "File upload" questions (currently just Q62), keyed by
  // questionId, already base64-encoded by the API route from the multipart
  // upload. Optional - most submissions won't have any.
  files?: Record<string, AttachmentUpload[]>;
};

export async function submitHSWalkaround(input: SubmissionInput) {
  const [sites, questions, rosters, templates] = await Promise.all([
    fetchSites(),
    fetchHSQuestions(),
    fetchRosters(),
    listRecords<{ TemplateName: string }>(TABLES.CHECKLIST_TEMPLATES),
  ]);

  const site = sites.find((s) => s.id === input.siteId);
  if (!site) throw new Error("Unknown site.");
  const hsTemplate = templates.find((t) => t.fields.TemplateName === HS_TEMPLATE_NAME);
  if (!hsTemplate) throw new Error(`Checklist Template "${HS_TEMPLATE_NAME}" not found.`);

  const applicableQuestions = scopeQuestionsForSite(questions, site);
  const questionById = new Map(applicableQuestions.map((q) => [q.id, q]));
  const rosterByQuestionId = new Map<string, RosterRow>();
  rosters.forEach((r) => r.templateQuestionIds.forEach((qid) => rosterByQuestionId.set(qid, r)));

  const today = new Date().toISOString().slice(0, 10);

  const [submission] = await createRecords<any>(TABLES.SUBMISSIONS, [
    {
      SubmissionName: `${site.name} - H&S Walkaround - ${today}`,
      Site: [site.id],
      ChecklistTemplate: [hsTemplate.id],
      Status: "Submitted",
      SubmissionType: "Self-Reported (Monthly)",
      SubmissionDate: today,
      CompletedByName: input.submittedByName,
      CompletedByEmail: input.submittedByEmail,
    },
  ]);

  // Only persist answers to questions that are actually applicable to this
  // site - protects against a stale client-side question list.
  const validAnswers = input.answers.filter((a) => questionById.has(a.questionId));

  const answerRecords = await createRecords<any>(
    TABLES.ANSWERS,
    validAnswers.map((a) => ({
      AnswerName: `${site.name} - Q${questionById.get(a.questionId)?.qnum ?? "?"}`,
      Submission: [submission.id],
      TemplateQuestion: [a.questionId],
      AnswerText: a.value,
    }))
  );

  // Build actions: roster mismatches + explicit issue fields + training/risk-assessment requests.
  const actionsToCreate: Record<string, any>[] = [];
  const immediateHits: { question: TemplateQuestion; answer: string }[] = [];
  const photoUploadErrors: string[] = [];

  // Photo uploads (currently just Q62) - one uploadAttachment call per file,
  // which appends to the Answer's Photo field rather than replacing it. Runs
  // after all Answers are created so we have real record IDs to attach to.
  // A failed upload doesn't fail the whole submission - the answers/actions
  // data matters more than the photo, and the walkaround checklist already
  // has a "email photos directly" fallback for exactly this kind of gap.
  for (let i = 0; i < validAnswers.length; i++) {
    const a = validAnswers[i];
    const files = input.files?.[a.questionId];
    if (!files || files.length === 0) continue;
    const answerRecord = answerRecords[i];
    for (const file of files) {
      try {
        await uploadAttachment(answerRecord.id, "Photo", file);
      } catch (err: any) {
        console.error(`H&S photo upload failed for Answer ${answerRecord.id} (${file.filename}):`, err);
        photoUploadErrors.push(file.filename);
      }
    }
  }

  validAnswers.forEach((a, i) => {
    const q = questionById.get(a.questionId)!;
    const answerRecord = answerRecords[i];

    if (q.urgency === "Immediate" && a.value && !a.value.startsWith("No") && a.value !== "0") {
      immediateHits.push({ question: q, answer: a.value });
    }

    const check = q.qnum && ROSTER_CHECKS[q.qnum] ? ROSTER_CHECKS[q.qnum](a.value, site) : null;
    if (check?.mismatch) {
      const roster = rosterByQuestionId.get(q.id);
      actionsToCreate.push({
        Name: `${site.name} - Q${q.qnum} roster mismatch`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        RosterMismatch: roster ? [roster.id] : undefined,
        IssueDescription: check.note,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: "Digest",
      });
    }

    if (q.qnum && ISSUE_FIELD_QUESTION_NUMBERS.has(q.qnum) && !isBlankOrNA(a.value)) {
      actionsToCreate.push({
        Name: `${site.name} - Q${q.qnum} reported issue`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        IssueDescription: a.value,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: q.urgency,
      });
    }

    // Q63/65: training request / risk assessment request - anything other than the "none needed" option.
    if (q.qnum === 63 && a.value) {
      actionsToCreate.push({
        Name: `${site.name} - training request`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        IssueDescription: `Training requested: ${a.value}`,
        Priority: "Low",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: "Digest",
      });
    }
    if (q.qnum === 65 && a.value && !a.value.split(";").every((v) => v.trim() === "Not Required")) {
      actionsToCreate.push({
        Name: `${site.name} - risk assessment request`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        IssueDescription: `Risk assessment requested: ${a.value}`,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: "Digest",
      });
    }
  });

  const createdActions = actionsToCreate.length ? await createRecords<any>(TABLES.ACTIONS, actionsToCreate) : [];

  if (immediateHits.length > 0) {
    await sendImmediateEscalation(site.name, input.submittedByName, input.submittedByEmail, immediateHits);
  }

  return {
    submissionId: submission.id,
    answersCreated: answerRecords.length,
    actionsCreated: createdActions.length,
    immediateEscalationSent: immediateHits.length > 0,
    photoUploadErrors,
  };
}

async function sendImmediateEscalation(
  siteName: string,
  byName: string,
  byEmail: string,
  hits: { question: TemplateQuestion; answer: string }[]
) {
  const to = process.env.HS_ESCALATION_EMAIL || process.env.MARKETING_NOTIFY_EMAIL;
  if (!to) {
    console.warn("HS_ESCALATION_EMAIL and MARKETING_NOTIFY_EMAIL both unset - skipping H&S immediate escalation email.");
    return;
  }
  const rows = hits
    .map(
      (h) => `<tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">Q${h.question.qnum}: ${escapeHtml(h.question.text)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${escapeHtml(h.answer)}</td>
      </tr>`
    )
    .join("");

  const body = `
    <p><strong>${escapeHtml(siteName)}</strong> just submitted an H&S Walkaround reporting an accident, incident, or near miss.</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px; margin: 12px 0;">
      <thead><tr style="text-align:left; color:${BRAND.grey};"><th style="padding:6px 8px;">Question</th><th style="padding:6px 8px;">Answer</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:${BRAND.grey}; font-size:13px;">Submitted by ${escapeHtml(byName)} (${escapeHtml(byEmail)}). Photos of the log pages, if any, should follow directly by email per the checklist instructions.</p>
  `;
  await sendEmail(to, `H&S: accident/incident/near miss reported - ${siteName}`, emailShell("Immediate H&S Escalation", body));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
