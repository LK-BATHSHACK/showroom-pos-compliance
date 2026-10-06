// H&S Walkaround - accidents / incidents / near misses / fires section
// (Lorraine, 6 Oct 2026 - Round 22).
//
// The section is "Q53: any accidents etc since the last checklist?" followed by
// "Q54: how many?", and then ONE BLOCK of questions (Q68-Q84 below) repeated
// for every incident reported. Each incident's answers are stored as ordinary
// Answer records, tagged with an IncidentNumber (1, 2, 3...) so they stay
// grouped on the H&S Review page. Questions Q53/Q54 stay where they always
// were; the per-incident block got new numbers because Lorraine's pasted
// Q55-Q66 numbering collided with live questions (Security, Fire Warden, etc).
//
// Pure functions only (no Airtable, no React) so the form (to decide what is
// visible/required), the server (to validate + flag) and the review page can
// all share exactly the same rules.

export const ACCIDENTS_LEAD_QNUM = 53; // "Any accidents, incidents, near misses or fires?"
export const INCIDENT_COUNT_QNUM = 54; // "How many?"
export const MAX_INCIDENTS = 5;

export const IQ = {
  TYPE: 68,
  DATE: 69,
  WHERE: 70,
  WHERE_OTHER: 71,
  WHO: 72,
  WHAT: 73,
  INJURED: 74,
  TREATMENT: 75,
  OFF_WORK: 76,
  HOSPITAL: 77,
  BOOK: 78,
  INVOLVED: 79,
  BEFORE: 80,
  MADE_SAFE: 81,
  EVIDENCE: 82,
  INVESTIGATION: 83,
  EMAILED: 84,
} as const;

/** Every per-incident question number - these are rendered once per incident, not as ordinary questions. */
export const INCIDENT_QNUMS: ReadonlySet<number> = new Set(Object.values(IQ));

export function isIncidentQnum(qnum: number | null | undefined): boolean {
  return qnum != null && INCIDENT_QNUMS.has(qnum);
}

/** Sort position of the incident block on the review page (after Q54, before the next section). */
export const INCIDENT_REVIEW_ORDER = 54.5;

/** Reads one answer of one incident by question number ("" when unanswered). Multi-select answers are "; "-joined. */
export type IncidentGetter = (qnum: number) => string;

function has(value: string, ...needles: string[]): boolean {
  const parts = value.split(";").map((s) => s.trim());
  return needles.some((n) => parts.some((p) => p === n || p.startsWith(n)));
}

const STAFF = ["Employee", "Agency worker"];
const NON_STAFF = ["Customer", "Visitor", "Contractor"];

/** Branching inside one incident - mirrors the "skip to" / "shown only if" rules in the spec. */
export function incidentQuestionVisible(qnum: number, get: IncidentGetter): boolean {
  const injured = get(IQ.INJURED) === "Yes";
  switch (qnum) {
    case IQ.WHERE_OTHER:
      return get(IQ.WHERE).startsWith("Other");
    case IQ.TREATMENT:
    case IQ.BOOK:
      return injured;
    case IQ.OFF_WORK:
      return injured && has(get(IQ.WHO), ...STAFF);
    case IQ.HOSPITAL:
      return injured && has(get(IQ.WHO), ...NON_STAFF);
    default:
      return true;
  }
}

/** Every visible incident question is required (the spec has no optional ones). */
export function incidentQuestionRequired(qnum: number, get: IncidentGetter): boolean {
  return incidentQuestionVisible(qnum, get);
}

// ---- Flagging -------------------------------------------------------------------

export type IncidentIssue = {
  kind: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  /** Immediate = also worth chasing straight away; Digest = normal follow-up. */
  urgency: "Immediate" | "Digest";
};

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "date not given";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function trunc(s: string, n = 220): string {
  const t = (s || "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** "Accident", "Incident", "Near miss" or "Fire / alarm" - short label for subjects and tables. */
export function incidentTypeLabel(get: IncidentGetter): string {
  const t = get(IQ.TYPE);
  if (t.startsWith("Accident")) return "Accident";
  if (t.startsWith("Incident")) return "Incident";
  if (t.startsWith("Near miss")) return "Near miss";
  if (t.startsWith("Fire")) return "Fire / alarm";
  return t || "Incident";
}

/** True for the "this is serious" combinations - hospital/ambulance, 3+ days off, or a non-employee taken to hospital. */
export function isSevere(get: IncidentGetter): boolean {
  if (get(IQ.INJURED) !== "Yes") return false;
  const treatment = get(IQ.TREATMENT);
  return (
    treatment.startsWith("Went to A&E") ||
    treatment.startsWith("Ambulance") ||
    get(IQ.OFF_WORK).startsWith("Yes, 3 days") ||
    get(IQ.OFF_WORK).startsWith("Not yet known") ||
    get(IQ.HOSPITAL) === "Yes"
  );
}

/** One-line plain-English summary of an incident (used on the Action and in the escalation email). */
export function incidentSummary(get: IncidentGetter): string {
  const type = incidentTypeLabel(get);
  const where = get(IQ.WHERE).startsWith("Other") && get(IQ.WHERE_OTHER) ? `Other - ${get(IQ.WHERE_OTHER)}` : get(IQ.WHERE) || "location not given";
  const who = get(IQ.WHO) || "who not given";
  const injury =
    get(IQ.INJURED) === "Yes"
      ? `Injury - ${get(IQ.TREATMENT) || "treatment not given"}`
      : get(IQ.INJURED) === "No"
        ? "No injury"
        : "";
  const what = get(IQ.WHAT) ? `"${trunc(get(IQ.WHAT))}"` : "";
  return [`${type} on ${formatDate(get(IQ.DATE))}`, where, `Involved: ${who}`, injury, what].filter(Boolean).join(" | ");
}

/**
 * All the Actions one incident should raise. Always at least one (the incident
 * itself, so it is on the Actions tracker), plus a specific follow-up for each
 * thing that needs doing: accident book not done, no investigation started, a
 * repeat of something that has happened before, evidence not kept, or the log
 * entry not yet emailed to hs@bathshack.com.
 */
export function incidentIssues(incidentNumber: number, get: IncidentGetter): IncidentIssue[] {
  const issues: IncidentIssue[] = [];
  const label = `Incident ${incidentNumber}`;
  const type = incidentTypeLabel(get);
  const injured = get(IQ.INJURED) === "Yes";
  const severe = isSevere(get);

  // 1. The incident itself.
  const priority: IncidentIssue["priority"] = severe ? "High" : type === "Near miss" ? "Low" : "Medium";
  const tail = severe ? " - serious: check whether this needs reporting to the HSE (RIDDOR / HSA / HSENI)." : "";
  issues.push({
    kind: `${label} reported`,
    priority,
    urgency: severe ? "Immediate" : "Digest",
    description: `(Q${IQ.TYPE}-Q${IQ.EMAILED} - ${label}) ${incidentSummary(get)}${tail}`,
  });

  // 2. Accident book not completed (only asked when someone was injured).
  if (injured && get(IQ.BOOK) === "No") {
    issues.push({
      kind: `${label} accident book`,
      priority: "High",
      urgency: "Immediate",
      description: `(Q${IQ.BOOK} - ${label}) Accident book entry NOT completed for the ${type.toLowerCase()} on ${formatDate(get(IQ.DATE))} - needs completing today.`,
    });
  }

  // 3. Investigation not started / not sure.
  const inv = get(IQ.INVESTIGATION);
  if (inv === "No" || inv === "Not sure") {
    issues.push({
      kind: `${label} investigation`,
      priority: type === "Near miss" ? "Low" : "Medium",
      urgency: "Digest",
      description: `(Q${IQ.INVESTIGATION} - ${label}) Investigation ${inv === "No" ? "not started" : "- not sure if started"} for the ${type.toLowerCase()} on ${formatDate(get(IQ.DATE))} - offer/send the investigation template.`,
    });
  }

  // 4. Something similar has happened before.
  const before = get(IQ.BEFORE);
  if (before === "Yes" || before === "Not sure") {
    issues.push({
      kind: `${label} possible repeat`,
      priority: "Medium",
      urgency: "Digest",
      description: `(Q${IQ.BEFORE} - ${label}) Something similar may have happened before at this showroom (${before}) - check for a pattern; a specific risk assessment may be needed.`,
    });
  }

  // 5. No evidence kept on an accident/incident/fire (CCTV gets overwritten).
  if (type !== "Near miss" && has(get(IQ.EVIDENCE), "None") && !get(IQ.EVIDENCE).includes(";")) {
    issues.push({
      kind: `${label} no evidence`,
      priority: "Low",
      urgency: "Digest",
      description: `(Q${IQ.EVIDENCE} - ${label}) No evidence kept (photos, CCTV, witness details) for the ${type.toLowerCase()} on ${formatDate(get(IQ.DATE))}.`,
    });
  }

  // 6. Log entry photo not yet emailed to hs@bathshack.com.
  if (get(IQ.EMAILED).startsWith("Not yet")) {
    issues.push({
      kind: `${label} log photo`,
      priority: "Medium",
      urgency: "Digest",
      description: `(Q${IQ.EMAILED} - ${label}) Photo of the log entry not yet emailed to hs@bathshack.com for the ${type.toLowerCase()} on ${formatDate(get(IQ.DATE))}.`,
    });
  }

  return issues;
}
