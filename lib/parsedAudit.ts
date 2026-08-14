// Shared shape every audit-file parser (the original single-showroom
// template, the Microsoft Forms export, and the Group A Spot Check
// workbook) normalises into, so the rest of the pipeline - scoring,
// Airtable writes, emails - doesn't need to know which format a given
// upload came from.

export type ParsedLineItem = {
  category: string;
  posName: string;
  conditionStatus: string;
  comments: string;
  hasPhoto?: boolean;
};

export type ParsedAudit = {
  showroomName: string;
  auditDate: string | null; // ISO yyyy-mm-dd
  auditType: string;
  completedByName: string;
  completedByEmail: string;
  generalComments: string;
  supportRequired: boolean;
  supportDetails: string;
  lineItems: ParsedLineItem[];
  // Free-text "anything else you need" type answers that don't map to a
  // catalogue item - surfaced as a POS Request instead of scored, so
  // nothing typed in good faith gets silently dropped on the floor.
  newIdeaText?: string;
  sourceLabel?: string; // e.g. "Boucher (NI - Aug 2026)" - for batch result reporting
};

// Canonical POS Master Catalogue list, mirrored from
// excel_template/build_template.py's POS_ITEMS so every parser maps onto
// the exact same item names the Airtable base uses.
export const CANONICAL_POS_ITEMS: { category: string; name: string }[] = [
  { category: "POS on Bays", name: "Product & Bay Pricing" },
  { category: "POS on Bays", name: "Tile Pricing Stickers" },
  { category: "POS on Bays", name: "Tile Specials Leaflets" },
  { category: "POS on Bays", name: "Bay Stickers (Variety)" },
  { category: "POS on Bays", name: "Bay Number Duck Stickers" },
  { category: "Sales POS", name: "Duck Stickers (General)" },
  { category: "Sales POS", name: "Star Wobblers" },
  { category: "Sales POS", name: "Sale Wobbler Ducks" },
  { category: "Sales POS", name: "Monthly Sale Posters (A3)" },
  { category: "Sales POS", name: "A3 Clear Sale Frames" },
  { category: "Sales POS", name: "Review / Pop-up Trustpilot Tent Cards" },
  { category: "Sales POS", name: "Showroom Exclusives A1 Frame & Easel" },
  { category: "Sales POS", name: "A6 Showroom Exclusives Labels" },
  { category: "Sales POS", name: "Showroom-Only Graphics" },
  { category: "Sales POS", name: "TV Slideshow (Customer-Facing Screens)" },
  { category: "Showroom Entrance", name: "Entrance A1 Frames" },
  { category: "Showroom Entrance", name: "Wobble Board (Outside Showroom)" },
  { category: "Terminals", name: "Framed Awards" },
  { category: "Terminals", name: "Trustpilot Poster (A3)" },
  { category: "Terminals", name: "Price Promise Poster" },
  { category: "Terminals", name: "QR Code Business Card + Review QR" },
  { category: "Terminals", name: "Returns Policy Pop-up" },
  { category: "Terminals", name: "Trustpilot Review Stickers" },
  { category: "Terminals", name: "Desk Tidy & Clutter-Free" },
  { category: "Customer Bathrooms", name: "Framed Customer Photos" },
  { category: "Toilets", name: "Toilet Roll Stickers" },
  { category: "Toilets", name: "Toilet Cleaning Checklist" },
  { category: "Showroom Branded Scent", name: "Brand Scent" },
  { category: "Other Signage", name: "Children Must Be Supervised Poster" },
];

// Free-text -> ConditionStatus heuristic, shared by both new parsers since
// neither source gives a clean dropdown value like the original template
// does. Built around the convention Jordan actually uses (confirmed):
// showroom cells only get overwritten with a problem description when
// something IS wrong - so this trusts "no negative signal -> compliant"
// rather than requiring an exact word-for-word match against a (often more
// verbose) reference sentence, which real free-text answers almost never
// hit even when genuinely compliant (e.g. reference "Yes - every tile
// sample has a completed sticker (code, description, price, box qty)" vs
// an observed "Yes" - not equal as strings, but clearly the same answer).
export function inferConditionStatus(observedRaw: string, referenceRaw?: string): string | null {
  const observed = (observedRaw || "").trim();
  const reference = (referenceRaw || "").trim();
  if (!observed) return null; // nothing recorded - caller decides how to treat a blank

  const lower = observed.toLowerCase();
  if (/damag|broken|torn|faded|ripped|worn|scuff/.test(lower)) return "Damaged";
  if (/outdated|out of date|old version|expired|not up to date|superseded/.test(lower)) return "Outdated";
  if (/wrong (position|place|location)|moved|relocat|not displayed|misplaced/.test(lower)) return "Incorrectly Positioned";
  if (/wrong brand|incorrect brand|old logo|off.brand|unapproved/.test(lower)) return "Incorrect Branding";
  if (/\bmissing\b|\bnone\b|\bno\b|\bn\/a\b|\bneed|short(?:age)?\b|not enough|insufficient|out of stock/.test(lower)) return "Missing";

  // Quantity shortfall check for count-based items: if both the reference
  // and the observed value start with a number and the observed number is
  // lower, that's a real deviation even without any keyword (e.g. Jordan
  // just writes "6" against a target of "10").
  const refNum = reference.match(/\d+/);
  const obsNum = observed.match(/\d+/);
  if (refNum && obsNum && Number(obsNum[0]) < Number(refNum[0])) return "Missing";

  // No negative signal and no quantity shortfall - treat as compliant.
  return "Present-OK";
}
