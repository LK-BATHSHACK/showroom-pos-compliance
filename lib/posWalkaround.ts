// In-tool POS Walkaround form - lets people fill out the same 30-question
// checklist that used to only arrive as a Microsoft Forms Excel export,
// directly in the app. Deliberately reuses processAuditSubmission.ts (the
// exact scoring + Airtable-write pipeline every other audit source already
// goes through) by building a ParsedAudit from the answers, rather than
// forking a second scoring model. Jordan's own spot-check rounds keep using
// the separate Excel upload path - this is for the monthly self-report every
// showroom does (see "Lorraine, 31 Aug 2026: 'Can we add the questions to be
// populated and filled out in the tool and then Jordan uses the upload for
// the audit upload?'").
//
// Question text/order/options are transcribed from the real live Microsoft
// Form (Showroom_POS_checklist.pdf, supplied by Lorraine 31 Aug 2026) and
// the qnum -> POS Master Catalogue mapping below is cross-checked against
// lib/parseMsFormsExcel.ts's MAPPINGS, which was itself verified against the
// same real form - so both paths agree on which catalogue item each
// question maps to. Unlike the Excel path, this form controls its own
// option text exactly, so answers map straight to a ConditionStatus rather
// than going through inferConditionStatus's free-text heuristic.

import { listRecords, createRecords, uploadAttachment, TABLES, type AttachmentUpload } from "./airtable";
import { ParsedAudit, ParsedLineItem, CANONICAL_POS_ITEMS } from "./parsedAudit";
import { loadSharedContext, processAuditSubmission, type ProcessedAuditResult } from "./processAuditSubmission";

export type PosFieldType = "text" | "date" | "radio" | "checkbox" | "photo";

export type PosQuestion = {
  qnum: number;
  section: string;
  text: string;
  type: PosFieldType;
  options?: string[];
  required?: boolean;
  helpText?: string;
  // Reference photo shown next to the question so whoever's filling this in
  // can see what "compliant" actually looks like - only the 8 questions
  // that had one in the real Microsoft Form get one here (31 Aug 2026,
  // Lorraine: "have the images been added that went with the questions?").
  // Extracted from Showroom_POS_checklist.pdf and stored as static files
  // rather than in Airtable's (currently empty) POS Master Catalogue
  // ReferenceImage field, so they're guaranteed to render regardless of
  // Airtable data state.
  referenceImageUrl?: string;
};

// Q2 ("Which showroom are you reporting for?") is answered implicitly by
// the showroom-selection step of this flow (a picker for Admin/Marketing,
// locked to the site's own showroom for Store Managers) - same pattern as
// H&S's Q3, so it isn't rendered as a form question here.
export const POS_WALKAROUND_QUESTIONS: PosQuestion[] = [
  { qnum: 1, section: "Details", text: "Date", type: "date", required: true },
  { qnum: 3, section: "Details", text: "Your name and role", type: "text", required: true },
  { qnum: 4, section: "Details", text: "How many customer-facing terminals does your showroom have?", type: "text", required: true },

  { qnum: 5, section: "Bay POS", text: "Tile samples - does every sample have a completed label (code, description, price, box qty)?", type: "radio", required: true, options: [
    "Yes - all tile samples are labelled",
    "Mostly - some are missing or incomplete",
    "No - most are missing labels",
  ] },
  { qnum: 6, section: "Bay POS", text: "Upload a photo showing tile labels in use", type: "photo", helpText: "Optional, but helps evidence Q5." },
  { qnum: 7, section: "Bay POS", text: "Does every bay have the numbered duck sticker in place?", type: "radio", required: true, options: [
    "Yes - all bays have their numbered duck sticker",
    "Some are missing",
    "No - most are missing",
  ] },

  { qnum: 8, section: "Sales POS", text: "Duck Sale Wobblers - do you have enough? (min. 10)", type: "radio", required: true, options: ["Yes - we have enough (10+)", "No - we need more"] },
  { qnum: 9, section: "Sales POS", text: "Star Wobblers - do you have enough? (NI: 10, ROI: 4)", type: "radio", required: true, options: ["Yes - we have enough", "No - we need more"] },
  { qnum: 10, section: "Sales POS", text: "A3 Sale Posters & Displays - do you have enough?", type: "radio", required: true, options: [
    "Yes - we have the right amount",
    "No - we need more posters",
    "No - we need more displays",
  ] },
  { qnum: 11, section: "Sales POS", text: "Showroom Exclusives A1 frame and easel - is it up, in good condition, and does it have a plant?", type: "checkbox", required: true, options: [
    "Yes",
    "No - need frame",
    "No - need easel",
    "No - need plant",
  ], referenceImageUrl: "/pos-reference/q11-showroom-exclusives-frame.jpg" },
  { qnum: 12, section: "Sales POS", text: "Tile Specials Leaflets - do you have enough? (30x)", type: "radio", required: true, options: ["Yes - we have enough (30+)", "No - we need more"], referenceImageUrl: "/pos-reference/q12-tile-specials-leaflets.jpg" },
  { qnum: 13, section: "Sales POS", text: "Upload a photo of sales POS in action", type: "photo", helpText: "General evidence - doesn't need to be tied to one specific item." },

  { qnum: 14, section: "Customer-Facing Terminals", text: "Are 3x awards displayed at each terminal?", type: "radio", required: true, options: ["Yes", "No"] },
  { qnum: 15, section: "Customer-Facing Terminals", text: "Trustpilot Poster/Sign - do you have enough? (4x)", type: "radio", required: true, options: ["Yes", "No"], referenceImageUrl: "/pos-reference/q15-trustpilot-poster.jpg" },
  { qnum: 16, section: "Customer-Facing Terminals", text: "Price Promise Poster/Sign - do you have enough? (5x)", type: "radio", required: true, options: ["Yes", "No"] },
  { qnum: 17, section: "Customer-Facing Terminals", text: "QR code review cards & business cards - are both in place at every terminal?", type: "checkbox", required: true, options: [
    "Yes",
    "No - missing QR code review cards",
    "No - missing business cards",
  ] },
  { qnum: 18, section: "Customer-Facing Terminals", text: "Is the Returns Policy Poster displayed?", type: "radio", required: true, options: ["Yes", "No"], referenceImageUrl: "/pos-reference/q18-returns-policy-poster.jpg" },
  { qnum: 19, section: "Customer-Facing Terminals", text: "Upload a photo of a customer-facing terminal with correct POS", type: "photo", helpText: "General evidence - doesn't need to be tied to one specific item." },

  { qnum: 20, section: "Rest of Showroom", text: "Trustpilot Review Tent Cards - do you have enough? (9x)", type: "radio", required: true, options: ["Yes", "No"], referenceImageUrl: "/pos-reference/q20-trustpilot-tent-cards.jpg" },
  { qnum: 21, section: "Rest of Showroom", text: "Are Trustpilot Review Stickers displayed?", type: "radio", required: true, options: ["Yes", "No"], referenceImageUrl: "/pos-reference/q21-trustpilot-stickers.jpg" },
  { qnum: 22, section: "Rest of Showroom", text: "Framed Bathroom Photos - do you have enough? (10x)", type: "radio", required: true, options: ["Yes", "No"] },
  { qnum: 23, section: "Rest of Showroom", text: "Is the Toilet Cleaning Rota up to date?", type: "radio", required: true, options: ["Yes", "No"] },
  { qnum: 24, section: "Rest of Showroom", text: "Are toilet roll stickers in place?", type: "radio", required: true, options: ["Yes", "No"], referenceImageUrl: "/pos-reference/q24-toilet-roll-stickers.jpg" },
  { qnum: 25, section: "Rest of Showroom", text: "Showroom scent - is everything present and topped up? (3x diffusers, 1x oil, 1x room spray)", type: "checkbox", required: true, options: [
    "Yes",
    "No - need diffuser(s)",
    "No - need oil",
    "No - need room spray",
  ] },
  { qnum: 26, section: "Rest of Showroom", text: "Children Must Be Supervised Signs - do you have enough? (4x)", type: "radio", required: true, options: ["Yes", "No"], referenceImageUrl: "/pos-reference/q26-children-supervised-sign.jpg" },
  { qnum: 27, section: "Rest of Showroom", text: "Are the TV Slideshows working and up to date?", type: "radio", required: true, options: ["Yes", "No - support needed"] },
  { qnum: 28, section: "Rest of Showroom", text: "Upload 1-3 photos of general showroom POS in action", type: "photo", helpText: "General evidence - doesn't need to be tied to one specific item." },

  { qnum: 29, section: "Feedback & New Ideas", text: "Are you in need of any POS assets which aren't on this list? All ideas welcome.", type: "text", helpText: "Leave blank if nothing to add - creates a \"New Idea\" POS Request if filled in." },
  { qnum: 30, section: "Feedback & New Ideas", text: "Do you require any other support or replacement assets?", type: "text", helpText: "Leave blank if nothing to add - creates a \"Replacement/Support Request\" POS Request if filled in." },
];

type ScoreRule =
  | { kind: "radio"; posName: string; missingOptions: string[] }
  | { kind: "multi-posname"; parts: { name: string; missingWhen: string }[] }
  | { kind: "checkbox-posname"; posName: string; presentOption: string }
  | { kind: "photo-for-item"; posName: string }
  | { kind: "evidence-photo" }
  | { kind: "info" }
  | { kind: "new-idea" }
  | { kind: "support-details" };

// The authoritative qnum -> POS Master Catalogue mapping for this form -
// cross-checked against parseMsFormsExcel.ts's MAPPINGS (confirmed 31 Aug
// 2026 against the same real form) so both intake paths score identically.
const SCORE_RULES: Record<number, ScoreRule> = {
  4: { kind: "info" },
  5: { kind: "radio", posName: "Tile Pricing Stickers", missingOptions: ["Mostly - some are missing or incomplete", "No - most are missing labels"] },
  6: { kind: "photo-for-item", posName: "Tile Pricing Stickers" },
  7: { kind: "radio", posName: "Bay Number Duck Stickers", missingOptions: ["Some are missing", "No - most are missing"] },
  8: { kind: "radio", posName: "Sale Wobbler Ducks", missingOptions: ["No - we need more"] },
  9: { kind: "radio", posName: "Star Wobblers", missingOptions: ["No - we need more"] },
  10: {
    kind: "multi-posname",
    parts: [
      { name: "Monthly Sale Posters (A3)", missingWhen: "No - we need more posters" },
      { name: "A3 Clear Sale Frames", missingWhen: "No - we need more displays" },
    ],
  },
  11: { kind: "checkbox-posname", posName: "Showroom Exclusives A1 Frame & Easel", presentOption: "Yes" },
  12: { kind: "radio", posName: "Tile Specials Leaflets", missingOptions: ["No - we need more"] },
  13: { kind: "evidence-photo" },
  14: { kind: "radio", posName: "Framed Awards", missingOptions: ["No"] },
  15: { kind: "radio", posName: "Trustpilot Poster (A3)", missingOptions: ["No"] },
  16: { kind: "radio", posName: "Price Promise Poster", missingOptions: ["No"] },
  17: { kind: "checkbox-posname", posName: "QR Code Business Card + Review QR", presentOption: "Yes" },
  18: { kind: "radio", posName: "Returns Policy Pop-up", missingOptions: ["No"] },
  19: { kind: "evidence-photo" },
  20: { kind: "radio", posName: "Review / Pop-up Trustpilot Tent Cards", missingOptions: ["No"] },
  21: { kind: "radio", posName: "Trustpilot Review Stickers", missingOptions: ["No"] },
  22: { kind: "radio", posName: "Framed Customer Photos", missingOptions: ["No"] },
  23: { kind: "radio", posName: "Toilet Cleaning Checklist", missingOptions: ["No"] },
  24: { kind: "radio", posName: "Toilet Roll Stickers", missingOptions: ["No"] },
  25: { kind: "checkbox-posname", posName: "Brand Scent", presentOption: "Yes" },
  26: { kind: "radio", posName: "Children Must Be Supervised Poster", missingOptions: ["No"] },
  27: { kind: "radio", posName: "TV Slideshow (Customer-Facing Screens)", missingOptions: ["No - support needed"] },
  28: { kind: "evidence-photo" },
  29: { kind: "new-idea" },
  30: { kind: "support-details" },
};

function catalogueCategory(posName: string): string {
  return CANONICAL_POS_ITEMS.find((c) => c.name === posName)?.category || "";
}

export type PosWalkaroundAnswer = {
  qnum: number;
  // Radio: the chosen option text. Checkbox: semicolon-joined selections
  // (matches H&S's "Multiple choice (checkboxes)" convention). Text/date:
  // raw text. Photo: not used here - see `files`.
  value: string;
};

export type PosWalkaroundInput = {
  showroomName: string;
  submittedByEmail: string;
  answers: PosWalkaroundAnswer[];
  // Files for the four "photo" questions (Q6, Q13, Q19, Q28), keyed by
  // qnum, already base64-encoded by the API route from the multipart
  // upload - same shape hs-submission.ts uses.
  files?: Record<number, AttachmentUpload[]>;
};

/** Builds the ParsedAudit this form's answers represent, so it can go through the exact same processAuditSubmission() pipeline as an Excel upload. */
export function buildParsedAudit(input: PosWalkaroundInput): ParsedAudit {
  const byQnum = new Map(input.answers.map((a) => [a.qnum, a.value]));
  const auditDate = byQnum.get(1) || null;
  const completedByName = byQnum.get(3) || "";
  const terminalCount = byQnum.get(4) || "";

  const lineItems: ParsedLineItem[] = [];
  let newIdeaText = "";
  let supportDetails = "";

  for (const [qnumStr, rule] of Object.entries(SCORE_RULES)) {
    const qnum = Number(qnumStr);
    const raw = (byQnum.get(qnum) || "").trim();

    if (rule.kind === "info" || rule.kind === "evidence-photo" || rule.kind === "photo-for-item") continue; // handled elsewhere (generalComments / photo upload)

    if (rule.kind === "new-idea") {
      if (raw) newIdeaText = raw;
      continue;
    }
    if (rule.kind === "support-details") {
      if (raw) supportDetails = raw;
      continue;
    }
    if (!raw) continue; // required fields are enforced client+server side, but don't score a genuinely blank answer

    if (rule.kind === "radio") {
      const status = rule.missingOptions.includes(raw) ? "Missing" : "Present-OK";
      lineItems.push({ category: catalogueCategory(rule.posName), posName: rule.posName, conditionStatus: status, comments: raw });
    } else if (rule.kind === "multi-posname") {
      for (const part of rule.parts) {
        const status = part.missingWhen === raw ? "Missing" : "Present-OK";
        lineItems.push({ category: catalogueCategory(part.name), posName: part.name, conditionStatus: status, comments: status === "Missing" ? raw : "" });
      }
    } else if (rule.kind === "checkbox-posname") {
      const selections = raw.split(";").map((s) => s.trim()).filter(Boolean);
      const status = selections.length > 0 && selections.every((s) => s === rule.presentOption) ? "Present-OK" : "Missing";
      lineItems.push({ category: catalogueCategory(rule.posName), posName: rule.posName, conditionStatus: status, comments: status === "Missing" ? raw : "" });
    }
  }

  // Q6's photo, if provided, evidences Q5's line item - same treatment as
  // parseMsFormsExcel's photoForPosName flag (the checkbox is "was a photo
  // attached", not a scored answer of its own).
  const q6Files = input.files?.[6];
  if (q6Files && q6Files.length > 0) {
    const item = lineItems.find((li) => li.posName === "Tile Pricing Stickers");
    if (item) item.hasPhoto = true;
  }

  const generalComments = terminalCount ? `Customer-facing terminals: ${terminalCount}` : "";

  return {
    showroomName: input.showroomName,
    auditDate,
    auditType: "Self-Reported (Monthly)",
    completedByName,
    completedByEmail: input.submittedByEmail,
    generalComments,
    supportRequired: !!supportDetails,
    supportDetails,
    lineItems,
    newIdeaText,
    sourceLabel: `${input.showroomName} (In-tool POS Walkaround, ${auditDate || "no date"})`,
  };
}

export type PosWalkaroundResult =
  | {
      ok: true;
      score: number;
      rag: "Green" | "Amber" | "Red";
      actionsCreated: number;
      actionsVerified: number;
      requestsCreated: number;
      photoUploadErrors: string[];
    }
  | { ok: false; error: string };

/** Full submit flow: score via processAuditSubmission, then upload evidence photos and log any New Idea / Replacement-Support Request text as a POS Request - mirrors submitHSWalkaround's shape so the form component/API route look familiar. */
export async function submitPOSWalkaround(input: PosWalkaroundInput): Promise<PosWalkaroundResult> {
  const parsed = buildParsedAudit(input);
  const ctx = await loadSharedContext();
  const raw: ProcessedAuditResult = await processAuditSubmission(parsed, ctx);

  // tsconfig has strict/strictNullChecks off, which means plain `if
  // (!raw.ok)` doesn't narrow this discriminated union (confirmed - same
  // reason app/api/upload-audit/route.ts uses an Extract<> type predicate
  // instead of inline narrowing) - so branch on the Extract<> types explicitly.
  if (!raw.ok) {
    const failed = raw as Extract<ProcessedAuditResult, { ok: false }>;
    return { ok: false, error: failed.error };
  }
  const result = raw as Extract<ProcessedAuditResult, { ok: true }>;

  const photoUploadErrors: string[] = [];

  // Q6 -> the "Tile Pricing Stickers" Audit Line Item's own Photo field.
  const q6Files = input.files?.[6] || [];
  const tileLineItemId = result.lineItemIdByPosName["Tile Pricing Stickers"];
  if (q6Files.length > 0 && tileLineItemId) {
    for (const file of q6Files) {
      try {
        await uploadAttachment(tileLineItemId, "Photo", file);
      } catch (err: any) {
        console.error(`POS Walkaround photo upload failed for Audit Line Item ${tileLineItemId} (${file.filename}):`, err);
        photoUploadErrors.push(file.filename);
      }
    }
  }

  // Q13/Q19/Q28 -> general evidence on the Audit's own EvidencePhotos field.
  const evidenceFiles = [13, 19, 28].flatMap((qnum) => input.files?.[qnum] || []);
  for (const file of evidenceFiles) {
    try {
      await uploadAttachment(result.auditId, "EvidencePhotos", file);
    } catch (err: any) {
      console.error(`POS Walkaround evidence photo upload failed for Audit ${result.auditId} (${file.filename}):`, err);
      photoUploadErrors.push(file.filename);
    }
  }

  // Q29/Q30 -> real, actionable POS Requests (not just text buried in the
  // Audit record) - this is the gap Lorraine flagged 31 Aug 2026 ("POS
  // request and submit new idea are different things"): New Idea (Q29) and
  // Replacement/Support Request (Q30) are now genuinely distinct.
  const requestsToCreate: Record<string, any>[] = [];
  if (parsed.newIdeaText) {
    requestsToCreate.push({
      Showroom: [], // resolved below via showroomsByNormalizedName
      RequesterName: parsed.completedByName,
      RequesterEmail: parsed.completedByEmail,
      RequestDate: parsed.auditDate || new Date().toISOString().slice(0, 10),
      IdeaDescription: parsed.newIdeaText,
      RequestType: "New Idea",
      Status: "Submitted",
    });
  }
  if (parsed.supportDetails) {
    requestsToCreate.push({
      Showroom: [],
      RequesterName: parsed.completedByName,
      RequesterEmail: parsed.completedByEmail,
      RequestDate: parsed.auditDate || new Date().toISOString().slice(0, 10),
      IdeaDescription: parsed.supportDetails,
      RequestType: "Replacement/Support Request",
      Status: "Submitted",
    });
  }
  if (requestsToCreate.length > 0) {
    const showroom = ctx.showroomsByNormalizedName.get(parsed.showroomName.toLowerCase().trim());
    requestsToCreate.forEach((r) => (r.Showroom = showroom ? [showroom.id] : []));
    await createRecords(TABLES.POS_REQUESTS, requestsToCreate);
  }

  return {
    ok: true,
    score: result.score,
    rag: result.rag,
    actionsCreated: result.actionsCreated,
    actionsVerified: result.actionsVerified,
    requestsCreated: requestsToCreate.length,
    photoUploadErrors,
  };
}

// ---------------------------------------------------------------------------
// Store Manager site-locking. Store Manager sessions carry a Sites-table
// siteId (see lib/auth.ts), but the POS pipeline (processAuditSubmission,
// scoring, the Showrooms table it all lives on) still runs on the OLD
// Showrooms table by name. Site names don't match Showroom names as strings
// ("Antrim Showroom" vs "Antrim") so this resolves through the Sites
// table's own SourceShowroom link field rather than guessing by text.
// ---------------------------------------------------------------------------

export type ShowroomForSite = { applies: true; showroomId: string; showroomName: string } | { applies: false; reason: string };

export async function resolveShowroomForSite(siteId: string): Promise<ShowroomForSite> {
  const [sites, showrooms] = await Promise.all([
    listRecords<{ SiteName: string; POSChecklistApplies?: boolean; SourceShowroom?: string[]; Active?: boolean }>(TABLES.SITES),
    listRecords<{ ShowroomName: string; Active?: boolean }>(TABLES.SHOWROOMS),
  ]);

  const site = sites.find((s) => s.id === siteId);
  if (!site) return { applies: false, reason: "Site not found." };
  if (!site.fields.POSChecklistApplies) {
    return { applies: false, reason: "POS checks don't apply to your site." };
  }
  const showroomId = site.fields.SourceShowroom?.[0];
  const showroom = showroomId ? showrooms.find((s) => s.id === showroomId) : undefined;
  if (!showroom) {
    return { applies: false, reason: "Your site isn't linked to a Showroom yet - ask Marketing to check the Sites table." };
  }
  return { applies: true, showroomId: showroom.id, showroomName: showroom.fields.ShowroomName };
}

/** Active POS-applicable showrooms for the Admin/Marketing picker - straight off the old Showrooms table, since they aren't restricted to one site. */
export async function fetchPosShowrooms(): Promise<{ id: string; name: string }[]> {
  const showrooms = await listRecords<{ ShowroomName: string; Active?: boolean }>(TABLES.SHOWROOMS);
  return showrooms
    .filter((s) => s.fields.Active !== false)
    .map((s) => ({ id: s.id, name: s.fields.ShowroomName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
