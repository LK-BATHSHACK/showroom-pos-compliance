// Extra H&S issue checks (Lorraine, 25 Sep 2026 - feedback from the first
// real September checks: an extinguisher service date due this month, an
// unticked first-aid-poster box, a "No" on Q35's Fire Warden Duties, Q27
// "I need help", Q37 "I'll speak with Gavin/Julia", and a "can I request
// the red poster" typed into Q31 all went through without flagging).
//
// Pure functions only - no Airtable calls - so submitHSWalkaround() can use
// them for every new check, and the same rules can be run over past
// submissions. Each returns zero or more issues for ONE answer; the caller
// turns them into Actions.
//
// Covered here (on top of the existing rules in hsSubmission.ts):
//   1. Date questions that are expiry/service dates (Q38 extinguisher
//      service, Q47 first aid kit expiry, Q67 next fire drill): already
//      passed -> High, due within 30 days of the check -> Medium.
//   2. Matrix questions (Q5 warehouse, Q35 Fire Warden Duties): every row
//      answered "No" is its own issue, whether or not the follow-up box
//      was filled in.
//   3. "Tick to confirm" checkbox questions (Q12 staff awareness, Q46 first
//      aid): every option left unticked is an issue. Q56 (cash handling) is
//      deliberately NOT included - its options are alternatives ("No cash
//      is used" vs "cash is held in a safe"), so leaving some unticked is
//      normal.
//   4. More single-choice / Yes-No answers that mean "something needs doing".
//   5. Free-text boxes that mention needing, requesting or missing something
//      (e.g. "can I request the red poster", "I don't have that poster").
//      A keyword match, not a judgement of meaning - it will occasionally
//      raise something that turns out to be fine, which is the safer way
//      round. Low priority.

export type IssuePriority = "High" | "Medium" | "Low";

export type ExtraIssue = {
  /** Short suffix for the Action's Name, e.g. "overdue date", "matrix No". */
  kind: string;
  description: string;
  priority: IssuePriority;
};

export type CheckQuestion = {
  qnum: number | null;
  section: string;
  answerType: string;
  options: string[];
};

// ---- 1. Expiry / service dates -------------------------------------------

export const DATE_CHECKS: Record<number, { label: string; pastWord: string }> = {
  38: { label: "Fire extinguisher service", pastWord: "overdue" },
  47: { label: "First aid kit", pastWord: "expired" },
  67: { label: "Fire drill", pastWord: "overdue" },
};
/** A date this many days or fewer after the check counts as "due soon". */
export const DUE_SOON_DAYS = 30;

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86400000);
}

function formatUkDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type DateStatus = "overdue" | "soon" | "ok" | "unknown";

/** Used by both the flagging below and the Key Dates view on H&S Review. */
export function dateStatus(dateIso: string | undefined | null, asOfIso: string): { status: DateStatus; days: number | null } {
  if (!dateIso || !isIsoDate(dateIso)) return { status: "unknown", days: null };
  const days = daysBetween(asOfIso, dateIso);
  if (days < 0) return { status: "overdue", days };
  if (days <= DUE_SOON_DAYS) return { status: "soon", days };
  return { status: "ok", days };
}

// ---- 4. Single choice / Yes-No -------------------------------------------

const OPTION_FLAGS: Record<number, { values: string[]; description: string; priority: IssuePriority }[]> = {
  18: [{ values: ["No"], description: "Not all staff have completed the Academy Manual Handling course", priority: "Low" }],
  22: [{ values: ["I have unsecured furniture in the showroom (please put suitable temporary signage on it)"], description: "Unsecured furniture in the showroom - temporary signage needed", priority: "Medium" }],
  25: [{ values: ["No, but I will train them now"], description: "Showroom staff not yet trained on reminding families about children/hazards - manager training them now", priority: "Low" }],
  27: [{ values: ["I am unable to check the list - I need help"], description: "Needs help checking the hazardous materials (danger label) list", priority: "Medium" }],
  28: [{ values: ["No"], description: "Not all staff have completed the Academy Fire Awareness course", priority: "Low" }],
  37: [
    {
      values: ["I'll speak with Gavin Carey/Julia Kerr who know how to do this and learn from him for next month"],
      description: "Emergency lighting test NOT done this month - needs Gavin Carey/Julia Kerr to show them how",
      priority: "Medium",
    },
  ],
  39: [{ values: ["No"], description: "Fire extinguisher details not recorded in the log book", priority: "Medium" }],
  59: [{ values: ["No, but I will organise this asap"], description: "Risk assessment sign-off sheet not completed/signed by all staff in the last 12 months (legal requirement)", priority: "Medium" }],
  66: [{ values: ["No - I need a poster"], description: "Fire Warden poster missing or doesn't show the Fire Warden's name - poster needed", priority: "Medium" }],
};

// ---- 3. Tick-to-confirm checkboxes ---------------------------------------

export const TICK_TO_CONFIRM_QNUMS = new Set([12, 46]);

// ---- 5. Free text ----------------------------------------------------------

// The form's own "report any issues here" boxes - these already raise an
// action for ANY text (ISSUE_FIELD_QUESTION_NUMBERS in hsSubmission.ts), so
// the keyword check below skips them to avoid a duplicate.
export const ISSUE_FIELD_QNUMS = new Set([4, 9, 13, 15, 17, 26, 40, 50, 57, 61]);

// Free-text questions where the answer is a name/place and a keyword can't
// mean an issue, plus Q24/Q64 (handled elsewhere). Q34 is handled
// explicitly below.
const KEYWORD_SKIP_QNUMS = new Set([1, 24, 34, 64]);

const NEEDS_SOMETHING_PATTERN =
  /\b(request(ed|ing)?|need(s|ed|ing)?|missing|lost|broken|damaged|expired|out of date|not working|doesn'?t work|replace(ment)?|order (a|an|one|some|more|new)|send (me|us)|help)\b|\b(don'?t|do not|haven'?t|have not|didn'?t|did not) (have|got|know where)\b|\bno (poster|sign|signage|kit|book|log ?book|extinguisher|printer)\b/i;

const PLAIN_NO_PATTERN = /^(no|nope|none|nothing|n\/?a|not (needed|required|applicable)|no need|all good|ok|okay|fine)[\s.!]*$/i;

export function mentionsNeed(text: string): boolean {
  const t = text.trim();
  if (!t || PLAIN_NO_PATTERN.test(t)) return false;
  return NEEDS_SOMETHING_PATTERN.test(t);
}

function truncate(s: string, n = 200): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function prefix(q: CheckQuestion): string {
  return `(Q${q.qnum}${q.section ? ` - ${q.section}` : ""})`;
}

// ---- Main entry ------------------------------------------------------------

export function extraIssuesForAnswer(q: CheckQuestion, value: string, checkDateIso: string): ExtraIssue[] {
  if (!q.qnum) return [];
  const v = (value || "").trim();
  const issues: ExtraIssue[] = [];

  // 1. Dates
  const dc = DATE_CHECKS[q.qnum];
  if (dc && q.answerType === "Date" && v) {
    const { status, days } = dateStatus(v, checkDateIso);
    if (status === "overdue") {
      issues.push({ kind: "overdue date", priority: "High", description: `${prefix(q)} ${dc.label} ${dc.pastWord} - date given was ${formatUkDate(v)}` });
    } else if (status === "soon") {
      issues.push({
        kind: "date due soon",
        priority: "Medium",
        description: `${prefix(q)} ${dc.label} due ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} (${formatUkDate(v)}) - book it in`,
      });
    }
  }

  // 2. Matrix rows answered "No"
  if (q.answerType === "Matrix" && v.startsWith("{")) {
    try {
      const rows = JSON.parse(v) as Record<string, string>;
      Object.entries(rows).forEach(([row, ans]) => {
        if (ans === "No") issues.push({ kind: "answered No", priority: "Medium", description: `${prefix(q)} No: ${row}` });
      });
    } catch {
      /* malformed matrix JSON - nothing to check */
    }
  }

  // 3. Tick-to-confirm checkboxes left unticked
  if (TICK_TO_CONFIRM_QNUMS.has(q.qnum) && q.answerType === "Multiple choice (checkboxes)") {
    const ticked = new Set(v.split(";").map((s) => s.trim()).filter(Boolean));
    q.options.forEach((opt) => {
      if (!ticked.has(opt)) issues.push({ kind: "not ticked", priority: "Medium", description: `${prefix(q)} Not confirmed (left unticked): ${opt}` });
    });
  }

  // 4. Single choice / Yes-No
  (OPTION_FLAGS[q.qnum] || []).forEach((f) => {
    if (f.values.includes(v)) issues.push({ kind: "reported issue", priority: f.priority, description: `${prefix(q)} ${f.description}` });
  });

  // Q34 "Do you require any update to the fire extinguishers after use?" -
  // free text, but really a yes/no: anything other than a plain no is a request.
  if (q.qnum === 34 && v && !PLAIN_NO_PATTERN.test(v)) {
    issues.push({ kind: "reported issue", priority: "Medium", description: `${prefix(q)} Fire extinguisher update needed after use: "${truncate(v)}"` });
  }

  // 5. Free text mentioning a need
  if (
    (q.answerType === "Short answer" || q.answerType === "Long answer") &&
    !ISSUE_FIELD_QNUMS.has(q.qnum) &&
    !KEYWORD_SKIP_QNUMS.has(q.qnum) &&
    mentionsNeed(v)
  ) {
    issues.push({ kind: "possible issue in answer", priority: "Low", description: `${prefix(q)} Possible request/issue mentioned - please check: "${truncate(v)}"` });
  }

  return issues;
}
