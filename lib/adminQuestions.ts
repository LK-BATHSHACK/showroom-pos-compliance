// Shared config for the Admin/H&S question editor (2 Sep 2026 - Lorraine:
// "for admin login only pencil to edit the question and a button to add new
// question on both POS and H&S"). Not itself part of either submission
// pipeline - this only decides what the editor UI shows as a warning.
//
// Both H&S (lib/hsSubmission.ts) and POS (lib/posWalkaround.ts) score/flag
// certain "Single choice"/"Multiple choice (checkboxes)" questions by
// matching the answer's VALUE against a literal string or list of strings
// hardcoded in that scoring/flagging code - not by qnum alone. Editing one
// of those options' wording through the editor changes what the respondent
// sees but NOT the hardcoded string being matched against, so a previously-
// working flag/score can silently stop firing (or start mis-firing) the
// moment the wording no longer matches exactly. Text-only edits, additions
// of a genuinely new option, Required, and Order are all safe - it's
// specifically renaming/removing an EXISTING option's text that's risky.
// Yes/No-type questions aren't in either set below: those two labels are
// hardcoded in the form components, not sourced from OptionsNotes, so
// there's no option text for this editor to break in the first place.

export type TemplateKey = "hs" | "pos";

// qnum -> where in the code its option text is matched exactly. Purely
// documentation for whoever's maintaining this list - not read by any
// scoring code itself.
export const HS_PROTECTED_QNUMS: Record<number, string> = {
  10: "SINGLE_CHOICE_FLAG_VALUES (lib/hsSubmission.ts) - poster issue flag",
  11: "ROSTER_CHECKS/checkQ11 (lib/hsSubmission.ts) - H&S Reps roster check",
  19: "SINGLE_CHOICE_FLAG_VALUES - safe lifting poster flag",
  21: "SINGLE_CHOICE_FLAG_VALUES - large tile lifting poster flag",
  23: "POSTER_QUANTITY_BAD_VALUE (lib/hsSubmission.ts) - children-supervision poster flag",
  30: "SINGLE_CHOICE_FLAG_VALUES - muster point flag",
  36: "SINGLE_CHOICE_FLAG_VALUES - fire evacuation procedure flag",
  45: "SINGLE_CHOICE_FLAG_VALUES - first aid kit flag",
  51: "ROSTER_CHECKS/checkQ51 (lib/hsSubmission.ts) - Mental Health First Aider roster check",
  53: "KIT_USED_QNUM/ACCIDENTS_QNUM cross-check (lib/hsSubmission.ts)",
  58: "ROSTER_CHECKS/checkQ58 (lib/hsSubmission.ts) - Emergency Contact roster check, region-aware",
  60: "SINGLE_CHOICE_FLAG_VALUES - wet floor signs flag",
  65: "Risk assessment request detection (\"Not Required\" sentinel, lib/hsSubmission.ts)",
};

export const POS_PROTECTED_QNUMS: Record<number, string> = {
  5: "SCORE_RULES (lib/posWalkaround.ts) - Tile Pricing Stickers scoring",
  7: "SCORE_RULES - Bay Number Duck Stickers scoring",
  8: "SCORE_RULES - Sale Wobbler Ducks scoring",
  9: "SCORE_RULES - Star Wobblers scoring",
  10: "SCORE_RULES - Monthly Sale Posters/A3 Clear Sale Frames scoring",
  11: "SCORE_RULES - Showroom Exclusives A1 Frame & Easel scoring",
  12: "SCORE_RULES - Tile Specials Leaflets scoring",
  14: "SCORE_RULES - Framed Awards scoring",
  15: "SCORE_RULES - Trustpilot Poster (A3) scoring",
  16: "SCORE_RULES - Price Promise Poster scoring",
  17: "SCORE_RULES - QR Code Business Card + Review QR scoring",
  18: "SCORE_RULES - Returns Policy Pop-up scoring",
  20: "SCORE_RULES - Review/Pop-up Trustpilot Tent Cards scoring",
  21: "SCORE_RULES - Trustpilot Review Stickers scoring",
  22: "SCORE_RULES - Framed Customer Photos scoring",
  23: "SCORE_RULES - Toilet Cleaning Checklist scoring",
  24: "SCORE_RULES - Toilet Roll Stickers scoring",
  25: "SCORE_RULES - Brand Scent scoring",
  26: "SCORE_RULES - Children Must Be Supervised Poster scoring",
  27: "SCORE_RULES - TV Slideshow scoring",
};

export function isProtectedQuestion(template: TemplateKey, qnum: number | null): string | null {
  if (qnum === null) return null;
  const map = template === "hs" ? HS_PROTECTED_QNUMS : POS_PROTECTED_QNUMS;
  return map[qnum] || null;
}

// The only AnswerTypes an editor should be picking when adding a new
// question - matches Template Questions' real singleSelect choices (see
// get_table_schema on tbldqwTz1bDlYD0SY). "Condition status (POS pick)" and
// "Matrix" are deliberately left off: the former is a vestigial type from
// the old flat POS Compliance rows nothing renders, and Matrix questions
// need a specific sub-question list the simple editor here doesn't build.
export const EDITABLE_ANSWER_TYPES = [
  "Short answer",
  "Long answer",
  "Date",
  "Single choice",
  "Yes/No",
  "Multiple choice (checkboxes)",
  "File upload",
] as const;

export const OPTIONS_ANSWER_TYPES = new Set(["Single choice", "Multiple choice (checkboxes)"]);
