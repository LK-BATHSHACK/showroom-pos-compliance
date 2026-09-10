// Human-readable labels for H&S Actions Tracker rows (Lorraine, 8 Sep 2026:
// "how intuitive could we get?? I'm thinking at a glance - this tells Zara
// nothing... Could it be clever enough to say - (Q19) Request a Safe
// Lifting/Manual Handling Poster"). Every place hsSubmission.ts builds an
// IssueDescription now goes through formatHSIssueDescription() below instead
// of hand-rolling its own "${value} (Q${n})" string, so the Actions Tracker
// reads in plain English regardless of which question raised it.
//
// Labels are only written where the question/option text itself makes the
// specific thing clear (e.g. Q19's own options name "a poster" in a
// "Manual Handling" section right after a safe-lifting-technique question).
// Where a question refers to "this poster" without naming which one in its
// own text (Q10 - the NI-only poster question doesn't say which poster in
// its stored QuestionText/OptionsNotes), the label stays deliberately
// generic rather than guessing - flagged inline below.
export const HS_ACTION_LABELS: Record<number, string> = {
  10: "NI site poster reported as missing/needs replacing", // "this poster" isn't named in Q10's own text - see note above
  19: "Request a Safe Lifting / Manual Handling poster",
  21: "Request a Large-Format Tile Handling poster",
  30: "Muster point not shown on the wall evacuation procedure - needs updating",
  36: "Fire evacuation plan on the wall doesn't match the intranet copy",
  45: "First aid kit reported as incorrect for the site",
  60: "Wet floor signage needed",
  23: "More children-supervision signage requested",
  16: "No regular bins/food waste/fridge cleaning schedule reported",
};

// Section names for the plain "report any issues here" free-text questions
// (ISSUE_FIELD_QUESTION_NUMBERS in hsSubmission.ts) - the user's own text IS
// the issue content, so these just add "(Q17 - Welfare Facilities)" context
// rather than replacing what they wrote.
export const HS_QUESTION_SECTIONS: Record<number, string> = {
  4: "General Information",
  9: "Warehouse Section Only",
  13: "Posters, Visuals & Documents",
  15: "Welfare Facilities",
  17: "Welfare Facilities",
  26: "Hazards & Housekeeping Standards",
  40: "Fire Warden Checklist",
  50: "First Aid",
  57: "Security",
  61: "Maintenance Task Planner",
};

// For a flagged Single choice / quantity-style answer, where the option
// text alone doesn't read as a standalone action item to someone unfamiliar
// with the form (e.g. "Request a poster") - drop the raw option value and
// use the descriptive label instead. Falls back to the raw value if a qnum
// has no hand-authored label yet, so nothing goes silently blank.
export function formatFlaggedIssue(qnum: number, rawValue: string): string {
  const label = HS_ACTION_LABELS[qnum];
  return `(Q${qnum}) ${label || rawValue}`;
}

// For a free-text "report any issues here" answer - the user's own words
// are the content, this just adds section context so it's traceable
// without opening the submission.
export function formatFreeTextIssue(qnum: number, rawValue: string): string {
  const section = HS_QUESTION_SECTIONS[qnum];
  return section ? `(Q${qnum} - ${section}) ${rawValue}` : `(Q${qnum}) ${rawValue}`;
}

// For roster-mismatch checks (checkQ11/51/58) - their own `note` text is
// already descriptive, this just standardises the (Qn) prefix to lead,
// matching every other action type.
export function formatRosterIssue(qnum: number, note: string): string {
  return `(Q${qnum}) ${note}`;
}

// For an "I don't know"/"not sure"-shaped answer to a free-text question
// that isn't already an unconditional issue box (Zara, 9 Sep 2026 - see
// isUncertainAnswer in hsSubmission.ts). Includes the question's own
// section so it's traceable the same way formatFreeTextIssue's actions are,
// and echoes exactly what was typed rather than paraphrasing it.
export function formatUncertainIssue(qnum: number, section: string, rawValue: string): string {
  return `(Q${qnum}${section ? ` - ${section}` : ""}) Answer unclear - needs following up: "${rawValue}"`;
}
