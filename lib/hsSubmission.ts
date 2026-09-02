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

export type ReferenceImage = { url: string; caption?: string };

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
  // Reference photo(s) shown next to the question so whoever's filling this
  // in can see what "compliant" actually looks like - same reasoning and
  // pattern as the POS Walkaround form's referenceImageUrl (31 Aug/1 Sep
  // 2026, Lorraine noticed the H&S poster questions were missing theirs
  // too). Extracted from the source Excel's embedded cell images
  // ("Health and Safety Checklist Questions with posters etc for
  // Lorraine.xlsx") and stored as static files under public/hs-reference/,
  // not in Airtable (Template Questions has no image field yet) - same
  // "guaranteed to render regardless of Airtable data state" reasoning as
  // POS. A question can have more than one (e.g. Q10's NI vs GB poster,
  // Q58's NI vs ROI contacts) since the real form shows different posters
  // depending on the respondent's region.
  referenceImages: ReferenceImage[];
};

// qnum -> reference image(s), keyed by the real H&S form's question number
// (Template Questions.QuestionNumber). Only the 13 questions that actually
// had an embedded image in the source Excel get an entry here.
const HS_REFERENCE_IMAGES: Record<number, ReferenceImage[]> = {
  10: [
    { url: "/hs-reference/q10-ni-poster.png", caption: "NI" },
    { url: "/hs-reference/q10-gb-poster.png", caption: "GB (red poster)" },
  ],
  11: [{ url: "/hs-reference/q11-hs-reps-poster.png" }],
  19: [
    { url: "/hs-reference/q19-manual-handling-poster-1.png", caption: "Example 1" },
    { url: "/hs-reference/q19-manual-handling-poster-2.png", caption: "Example 2" },
  ],
  21: [{ url: "/hs-reference/q21-large-tile-lifting-poster.png" }],
  23: [{ url: "/hs-reference/q23-children-supervised-sign.png" }],
  29: [{ url: "/hs-reference/q29-assembly-point-sign.png" }],
  30: [{ url: "/hs-reference/q30-evacuation-procedure-example.png", caption: "Example only - yours will show your own site/Fire Warden" }],
  31: [{ url: "/hs-reference/q31-fire-marshals-poster-template.png" }],
  41: [{ url: "/hs-reference/q41-first-aid-responders-poster-template.png" }],
  44: [{ url: "/hs-reference/q44-first-aid-kit-size-chart.png" }],
  46: [{ url: "/hs-reference/q46-first-aid-kit-contents-chart.png" }],
  51: [{ url: "/hs-reference/q51-mhfa-poster.png" }],
  58: [
    { url: "/hs-reference/q58-emergency-contacts-ni.png", caption: "NI" },
    { url: "/hs-reference/q58-emergency-contacts-roi.png", caption: "ROI" },
  ],
};

export type SiteOption = {
  id: string;
  name: string;
  siteType: string | null;
  region: "NI" | "ROI" | "GB" | null;
  hsApplies: boolean;
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
  const records = await listRecords<{ SiteName: string; SiteType?: string; Region?: string; Active?: boolean; "H&SChecklistApplies"?: boolean }>(TABLES.SITES);
  return records
    .filter((r) => r.fields.Active !== false)
    .map((r) => ({
      id: r.id,
      name: r.fields.SiteName,
      siteType: r.fields.SiteType || null,
      region: (r.fields.Region as any) || null,
      hsApplies: r.fields["H&SChecklistApplies"] === true,
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
      referenceImages: HS_REFERENCE_IMAGES[q.fields.QuestionNumber ?? -1] || [],
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
// see the architecture note in app/hs-check: auto-Action-creation only
// covers roster mismatches + these explicit fields + the two training/risk-
// assessment request questions; every other answer is still fully visible
// on the H&S Review page for Salli/Marketing/Admin to act on by hand.
// ---------------------------------------------------------------------------

const ISSUE_FIELD_QUESTION_NUMBERS = new Set([4, 9, 13, 15, 17, 26, 40, 50, 57, 61]);

function isBlankOrNA(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "" || t === "n/a" || t === "na" || t === "none";
}

// ---------------------------------------------------------------------------
// Broader "some things aren't picking up issues" fix (Salli, via Lorraine,
// 2 Sep 2026 - she gave Q16/Q24 as examples but the underlying gap is
// general: several Single choice questions have an obvious "bad"/request
// option that ISSUE_FIELD_QUESTION_NUMBERS and ROSTER_CHECKS never covered
// because neither mechanism was built to look at a Single choice value on
// its own). This is deliberately scoped to the options that clearly read as
// "something needs following up" on inspection of the real question set
// (Aug/Sept 2026), not every Single choice option - see the architecture
// doc for the full list this was checked against.
// ---------------------------------------------------------------------------

const SINGLE_CHOICE_FLAG_VALUES: Record<number, string[]> = {
  10: ["Report issue/Order Replacement"], // H&S poster (NI/GB variant) missing/wrong
  19: ["Request a poster"], // safe lifting technique poster
  21: ["Request a poster"], // large tile lifting poster
  30: ["No, I need to update it (please send me a link to an editable version)"], // muster point not on evac procedure
  36: [
    "Mine is different - I will send a copy to Salli to upload",
    "It's missing - I will send a copy to Salli to upload",
  ], // fire evacuation procedure vs intranet
  45: ["No - I will contact Salli Hunt to discuss"], // first aid kit not correct
  60: ["No - I need some"], // wet floor signs
};

// Q23 ("Request more posters" - children-supervision signage) is handled
// separately, not via the map above, because Salli specifically wants the
// quantity from Q24 ("How many copies?") folded into the one action rather
// than raised as two disconnected items.
const POSTER_QUANTITY_QNUM = 23;
const POSTER_QUANTITY_FOLLOWUP_QNUM = 24;
const POSTER_QUANTITY_BAD_VALUE = "Request more posters";

// Q16 ("bins/food waste/fridges cleaned out regularly") - "No" should be
// flagged even with no accompanying Q17 text (Salli, 2 Sep 2026: "I said on
// Q16 - NO but I didn't report any wording as an issue... I wonder if it
// could pick up on that being a NO?"). If Q17 DOES have real text, that's
// already covered by Q17 being in ISSUE_FIELD_QUESTION_NUMBERS - this only
// fires to cover the gap where no free text was given.
const WELFARE_BINS_QNUM = 16;
const WELFARE_BINS_BAD_VALUE = "No";
const WELFARE_BINS_FOLLOWUP_QNUM = 17;

// Q49 ("kit used") / Q53 ("accidents/incidents/near misses") consistency
// check (Salli, 2 Sep 2026: "I said no accidents but I said yes to kit
// being used - I wonder if it could pick that up somehow?"). Different
// sections (First Aid vs Accidents/Incidents), so this can't live in the
// per-question loop the way ISSUE_FIELD_QUESTION_NUMBERS does - it needs
// both answers looked up together, after all answers are known.
const KIT_USED_QNUM = 49;
const ACCIDENTS_QNUM = 53;

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
  // req.headers.get("host") from the API route, so the submission-summary
  // email (see sendSubmissionSummaryEmail) can link straight back to
  // /hs-review/[id] - same pattern as the monthly-summary cron's dashboard
  // link. Optional - the email still sends without it, just without a link.
  appHost?: string;
};

// ---------------------------------------------------------------------------
// Who gets H&S notification emails (submission summaries, accident/incident
// escalations, monthly-overdue digest - see submitHSWalkaround and the
// reminders cron). Looked up from the Users table (Role: "H&S", Active) so
// it stays correct automatically as who holds that role changes, rather than
// hardcoding Salli's address in source or requiring a Vercel env var to be
// kept in sync with Users & Access by hand. Falls back to HS_ESCALATION_EMAIL
// then MARKETING_NOTIFY_EMAIL if no active H&S user is found, so a gap in
// Users & Access doesn't silently mean nobody gets notified.
// ---------------------------------------------------------------------------

export async function getHSNotifyEmails(): Promise<string[]> {
  const users = await listRecords<{ Role?: string; Email?: string; Active?: boolean }>(TABLES.USERS);
  const hsUsers = users
    .filter((u) => u.fields.Role === "H&S" && u.fields.Active === true && u.fields.Email)
    .map((u) => u.fields.Email as string);
  if (hsUsers.length > 0) return hsUsers;
  return [process.env.HS_ESCALATION_EMAIL, process.env.MARKETING_NOTIFY_EMAIL].filter((e): e is string => !!e);
}

// The day of the month H&S checks are considered "due" - if a site hasn't
// submitted an H&S Walkaround for the current calendar month by this day,
// the overdue digest (see the reminders cron) includes it. H&S has no real
// per-site due-date data the way POS's NextAuditDue does (flagged in Round 3
// as needing cadence dates from Salli, which weren't available yet) - this
// is a reasonable default assuming a straightforward "once a month" cadence
// for every site, not confirmed cadence data. Easy to change to a real
// per-site NextHSCheckDue field later if the cadence turns out to vary by
// site/region - flag that to Lorraine rather than assuming it's fine as-is.
export const HS_MONTHLY_DUE_DAY = 25;

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

  // Answers keyed by question number, for the cross-question checks below
  // (Q16/Q17, Q23/Q24, Q49/Q53) that need to look at more than one answer
  // at once rather than judging a single answer in isolation.
  const answerByQnum = new Map<number, { value: string; recordId: string }>();
  validAnswers.forEach((a, i) => {
    const qn = questionById.get(a.questionId)?.qnum;
    if (qn) answerByQnum.set(qn, { value: a.value, recordId: answerRecords[i].id });
  });

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
        IssueDescription: `${check.note} (Q${q.qnum})`,
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
        // Suffixed with the question number - people aren't always specific
        // in what they type here (Salli, 2 Sep 2026: "there is an issue
        // that just says no - I'm not sure which question that relates
        // to"), so make it traceable without having to open the submission.
        IssueDescription: `${a.value} (Q${q.qnum})`,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: q.urgency,
      });
    }

    // Broader "bad option picked but never flagged" fix - see
    // SINGLE_CHOICE_FLAG_VALUES above.
    if (q.qnum && SINGLE_CHOICE_FLAG_VALUES[q.qnum]?.includes(a.value)) {
      actionsToCreate.push({
        Name: `${site.name} - Q${q.qnum} reported issue`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        IssueDescription: `${a.value} (Q${q.qnum})`,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: q.urgency,
      });
    }

    // Q23 "Request more posters" - fold in Q24's quantity rather than
    // raising a second, disconnected item (Salli, 2 Sep 2026).
    if (q.qnum === POSTER_QUANTITY_QNUM && a.value === POSTER_QUANTITY_BAD_VALUE) {
      const qty = answerByQnum.get(POSTER_QUANTITY_FOLLOWUP_QNUM)?.value;
      actionsToCreate.push({
        Name: `${site.name} - Q${q.qnum} reported issue`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        IssueDescription: `More children-supervision posters requested (Q${q.qnum})${qty ? ` - quantity: ${qty}` : ""}.`,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: q.urgency,
      });
    }

    // Q16 "No" with no Q17 free text - flag it anyway (Salli, 2 Sep 2026).
    // If Q17 does have real text, ISSUE_FIELD_QUESTION_NUMBERS (which
    // includes 17) already raises an action from that - skip here to avoid
    // duplicating it.
    if (q.qnum === WELFARE_BINS_QNUM && a.value === WELFARE_BINS_BAD_VALUE) {
      const followUp = answerByQnum.get(WELFARE_BINS_FOLLOWUP_QNUM)?.value || "";
      if (isBlankOrNA(followUp)) {
        actionsToCreate.push({
          Name: `${site.name} - Q${q.qnum} reported issue`,
          Status: "Open",
          Site: [site.id],
          SourceAnswer: [answerRecord.id],
          IssueDescription: `No regular process/schedule for bins/food waste/fridge cleaning reported (Q${q.qnum}) - no further detail given.`,
          Priority: "Medium",
          OwnerName: input.submittedByName,
          OwnerEmail: input.submittedByEmail,
          DateIdentified: today,
          UrgencyClass: q.urgency,
        });
      }
    }

    // Q63/65: training request / risk assessment request - anything other than the "none needed" option.
    if (q.qnum === 63 && a.value) {
      actionsToCreate.push({
        Name: `${site.name} - training request`,
        Status: "Open",
        Site: [site.id],
        SourceAnswer: [answerRecord.id],
        IssueDescription: `Training requested: ${a.value} (Q${q.qnum})`,
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
        IssueDescription: `Risk assessment requested: ${a.value} (Q${q.qnum})`,
        Priority: "Medium",
        OwnerName: input.submittedByName,
        OwnerEmail: input.submittedByEmail,
        DateIdentified: today,
        UrgencyClass: "Digest",
      });
    }
  });

  // Q49/Q53 consistency check (Salli, 2 Sep 2026): kit reported used but no
  // accident/incident/near miss logged for the same visit is worth a nudge
  // even though neither answer alone is "wrong" - it's the combination.
  // Deliberately Low priority/Digest, not an immediate escalation - this is
  // "worth double-checking", not itself an accident report.
  const kitUsed = answerByQnum.get(KIT_USED_QNUM);
  const accidentsReported = answerByQnum.get(ACCIDENTS_QNUM);
  if (kitUsed?.value === "Yes" && accidentsReported && !accidentsReported.value.startsWith("Yes")) {
    actionsToCreate.push({
      Name: `${site.name} - Q${KIT_USED_QNUM}/Q${ACCIDENTS_QNUM} inconsistency`,
      Status: "Open",
      Site: [site.id],
      SourceAnswer: [kitUsed.recordId],
      IssueDescription: `First aid kit reported as used (Q${KIT_USED_QNUM}) but no accident/incident/near miss was logged (Q${ACCIDENTS_QNUM}: "${accidentsReported.value}") - worth checking this was recorded correctly.`,
      Priority: "Low",
      OwnerName: input.submittedByName,
      OwnerEmail: input.submittedByEmail,
      DateIdentified: today,
      UrgencyClass: "Digest",
    });
  }

  const createdActions = actionsToCreate.length ? await createRecords<any>(TABLES.ACTIONS, actionsToCreate) : [];

  if (immediateHits.length > 0) {
    await sendImmediateEscalation(site.name, input.submittedByName, input.submittedByEmail, immediateHits);
  }

  // Submission summary - every H&S check, not just ones with issues (per
  // Lorraine, 1 Sep 2026: "salli.hunt@bathshack.com gets notified when one
  // is submitted ... with any actions at the end that might need to be
  // taken"). Separate from the immediate-escalation email above, which is
  // specifically for accident/incident/near-miss content.
  await sendSubmissionSummaryEmail(site.name, submission.id, input.submittedByName, input.submittedByEmail, actionsToCreate, input.appHost);

  return {
    submissionId: submission.id,
    answersCreated: answerRecords.length,
    actionsCreated: createdActions.length,
    immediateEscalationSent: immediateHits.length > 0,
    photoUploadErrors,
  };
}

async function sendSubmissionSummaryEmail(
  siteName: string,
  submissionId: string,
  byName: string,
  byEmail: string,
  actions: Record<string, any>[],
  appHost?: string
) {
  const to = await getHSNotifyEmails();
  if (to.length === 0) {
    console.warn("No H&S notify recipients found (no active H&S user, HS_ESCALATION_EMAIL or MARKETING_NOTIFY_EMAIL) - skipping H&S submission summary email.");
    return;
  }

  const actionsHtml =
    actions.length > 0
      ? `<table style="width:100%; border-collapse:collapse; font-size:14px; margin: 12px 0;">
           <thead><tr style="text-align:left; color:${BRAND.grey};"><th style="padding:6px 8px;">Issue</th><th style="padding:6px 8px;">Priority</th></tr></thead>
           <tbody>${actions
             .map(
               (a) => `<tr>
                 <td style="padding:6px 8px; border-bottom:1px solid #eee;">${escapeHtml(a.IssueDescription || "")}</td>
                 <td style="padding:6px 8px; border-bottom:1px solid #eee;">${escapeHtml(a.Priority || "")}</td>
               </tr>`
             )
             .join("")}</tbody>
         </table>`
      : `<p style="color:${BRAND.grey};">No follow-up actions flagged from this check - no roster/poster mismatches or reported issues.</p>`;

  const link = appHost ? `<p style="margin-top:20px;"><a href="https://${appHost}/hs-review/${submissionId}" style="color:${BRAND.pink};">View the full submission</a></p>` : "";

  const body = `
    <p><strong>${escapeHtml(siteName)}</strong> submitted an H&S Check, completed by ${escapeHtml(byName)} (${escapeHtml(byEmail)}).</p>
    <h3 style="margin-bottom:6px;">Actions that may need to be taken</h3>
    ${actionsHtml}
    ${link}
  `;
  await sendEmail(to, `H&S Check submitted - ${siteName}`, emailShell("H&S Check Submitted", body));
}

async function sendImmediateEscalation(
  siteName: string,
  byName: string,
  byEmail: string,
  hits: { question: TemplateQuestion; answer: string }[]
) {
  const to = await getHSNotifyEmails();
  if (to.length === 0) {
    console.warn("No H&S notify recipients found (no active H&S user, HS_ESCALATION_EMAIL or MARKETING_NOTIFY_EMAIL) - skipping H&S immediate escalation email.");
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

// ---------------------------------------------------------------------------
// H&S compliance score - a per-site pass rate for the site's most recent H&S
// Walkaround submission (applicable answers minus answers that produced a
// flagged Action, e.g. a roster mismatch or reported issue), kept as its OWN
// score rather than blended into POS's 100-point score. Confirmed with
// Lorraine 31 Aug 2026 ("the overall compliance score should now take into
// consideration h&s and pos checks" -> "Two separate scores, shown side by
// side") - H&S was deliberately built as pass/fail-with-escalation rather
// than a weighted point score (see the architecture doc's "Scoring is
// deliberately not proposed as a universal feature" decision), so blending
// it into one number would misrepresent both.
//
// Unlike POS, there's no auto-re-verification of a resolved Action on the
// NEXT walkaround - so this score is a snapshot of that one walkaround's own
// findings (an answer counts as flagged if ANY Action was ever sourced from
// it, regardless of the Action's current Status), not a rolling open-issues
// count. Callers should pass hsAnswers/hsActions already filtered down to
// H&S-template records (same filtering hs-review/page.tsx already does via
// Template -> Template Questions -> Answers -> Actions), so this function
// doesn't need to know about templates/questions at all.
// ---------------------------------------------------------------------------

export type HSSiteScore = {
  siteId: string;
  siteName: string;
  latestSubmissionId: string | null;
  latestSubmissionDate: string | null;
  applicableCount: number;
  flaggedCount: number;
  score: number | null; // 0-100 pass rate, null = no submission yet for this site
};

export function computeHSSiteScores(
  hsApplicableSites: { id: string; name: string }[],
  hsSubmissions: { id: string; fields: { Site?: string[]; SubmissionDate?: string } }[],
  hsAnswers: { id: string; fields: { Submission?: string[] } }[],
  hsActions: { fields: { SourceAnswer?: string[] } }[]
): HSSiteScore[] {
  const flaggedAnswerIds = new Set<string>();
  hsActions.forEach((a) => (a.fields.SourceAnswer || []).forEach((id) => flaggedAnswerIds.add(id)));

  // Latest submission per site - hsSubmissions can arrive in any order, so
  // compare dates explicitly rather than relying on a caller-provided sort.
  const latestBySite = new Map<string, { id: string; date: string }>();
  hsSubmissions.forEach((s) => {
    const siteId = s.fields.Site?.[0];
    const date = s.fields.SubmissionDate || "";
    if (!siteId) return;
    const current = latestBySite.get(siteId);
    if (!current || date > current.date) latestBySite.set(siteId, { id: s.id, date });
  });

  return hsApplicableSites.map((site) => {
    const latest = latestBySite.get(site.id);
    if (!latest) {
      return { siteId: site.id, siteName: site.name, latestSubmissionId: null, latestSubmissionDate: null, applicableCount: 0, flaggedCount: 0, score: null };
    }
    const applicableAnswers = hsAnswers.filter((a) => (a.fields.Submission || []).includes(latest.id));
    const flaggedCount = applicableAnswers.filter((a) => flaggedAnswerIds.has(a.id)).length;
    const score = applicableAnswers.length === 0 ? null : Math.round(((applicableAnswers.length - flaggedCount) / applicableAnswers.length) * 1000) / 10;
    return {
      siteId: site.id,
      siteName: site.name,
      latestSubmissionId: latest.id,
      latestSubmissionDate: latest.date || null,
      applicableCount: applicableAnswers.length,
      flaggedCount,
      score,
    };
  });
}

/** Estate-wide H&S average = the mean of each H&S-applicable site's latest score (sites with no submission yet don't drag the average down to 0 - they're surfaced separately as "not yet walked around"). */
export function estateHSAverage(siteScores: HSSiteScore[]): number | null {
  const scored = siteScores.filter((s): s is HSSiteScore & { score: number } => s.score !== null);
  if (scored.length === 0) return null;
  return Math.round((scored.reduce((sum, s) => sum + s.score, 0) / scored.length) * 10) / 10;
}
