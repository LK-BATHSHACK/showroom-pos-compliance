import * as XLSX from "xlsx";
import { ParsedAudit, ParsedLineItem, inferConditionStatus } from "./parsedAudit";

// Parses the Excel export of the Microsoft Form every showroom now
// completes monthly themselves (see POS Monitoring Process.md, updated 14
// Aug 2026: all 13 showrooms self-report monthly; Jordan's visits are spot
// checks via the Audit Intake Template instead of a full audit). One row
// per submission, Microsoft's own metadata columns (ID, Start time, Email,
// ...) plus one column per form question. Column headers are matched by
// keyword rather than position, since Forms re-orders/renumbers columns if
// questions are edited later.
//
// KNOWN GAPS (flagged to Lorraine when this was built, not silently
// assumed away):
// - "Tile Specials Leaflets", "A6 Showroom Exclusives Labels", and
//   "Trustpilot Review Stickers" were added to the POS Master Catalogue on
//   14 Aug 2026 as Mandatory items specifically so these three form
//   questions could be scored properly - make sure those 3 rows exist in
//   Airtable with those exact names before relying on this.
// - Some catalogue items still have no corresponding form question at all
//   (Desk Tidy & Clutter-Free, Bay Stickers (Variety), Showroom-Only
//   Graphics, Entrance A1 Frames, Wobble Board, Product & Bay Pricing) -
//   they're simply not checked via this path, same as any other item a
//   given form skips (computeAuditScore doesn't penalise for items with
//   no data).
// - "Duck Sale Wobblers" and "A3 Sale Posters & Displays" - RESOLVED 31 Aug
//   2026 against the real live form (Lorraine sent the exported question
//   list, since forms.cloud.microsoft can't be fetched directly):
//     - Q8 "Duck Sale Wobblers - Do you have enough? (min. 10)" is about
//       wobblers, not stickers - maps to "Sale Wobbler Ducks", not "Duck
//       Stickers (General)" as previously guessed.
//     - Q10 "A3 Sale Posters & Displays - Do you have enough?" turned out
//       to be ONE question covering TWO catalogue items at once ("Monthly
//       Sale Posters (A3)" and "A3 Clear Sale Frames"), with a 3-way
//       answer that does distinguish which is short ("We need more
//       posters" vs "We need more displays"). Handled below via
//       `multiPosName` rather than a single `posName`, so each half scores
//       against the right catalogue item instead of only one of them ever
//       getting data from this form.

type Mapping =
  | { match: RegExp; posName: string }
  | { match: RegExp; multiPosName: { name: string; missingWhen: RegExp }[] }
  | { match: RegExp; photoForPosName: string }
  | { match: RegExp; special: string };

const MAPPINGS: Mapping[] = [
  { match: /which showroom/i, special: "showroom" },
  { match: /your name and role/i, special: "completedByName" },
  { match: /^email$/i, special: "completedByEmail" },
  { match: /^date$/i, special: "auditDate" },

  { match: /tile samples.*label/i, posName: "Tile Pricing Stickers" },
  { match: /image showing tile labels/i, photoForPosName: "Tile Pricing Stickers" },
  { match: /numbered duck sticker/i, posName: "Bay Number Duck Stickers" },
  { match: /duck sale wobblers/i, posName: "Sale Wobbler Ducks" }, // confirmed 31 Aug 2026 against the real form (Q8, "min. 10" wobblers)
  { match: /star wobblers/i, posName: "Star Wobblers" },
  {
    // confirmed 31 Aug 2026 against the real form (Q10) - one question, two
    // catalogue items, answer text distinguishes which is short.
    match: /a3 sale posters & displays/i,
    multiPosName: [
      { name: "Monthly Sale Posters (A3)", missingWhen: /need more posters/i },
      { name: "A3 Clear Sale Frames", missingWhen: /need more displays/i },
    ],
  },
  { match: /a1 frame and easel/i, posName: "Showroom Exclusives A1 Frame & Easel" },
  { match: /awards displayed at each terminal/i, posName: "Framed Awards" },
  { match: /trustpilot poster\/sign/i, posName: "Trustpilot Poster (A3)" },
  { match: /price promise poster\/sign/i, posName: "Price Promise Poster" },
  { match: /qr code review cards/i, posName: "QR Code Business Card + Review QR" },
  { match: /returns policy poster/i, posName: "Returns Policy Pop-up" },
  { match: /trustpilot review tent cards/i, posName: "Review / Pop-up Trustpilot Tent Cards" },
  { match: /framed bathroom photos/i, posName: "Framed Customer Photos" },
  { match: /toilet cleaning rota/i, posName: "Toilet Cleaning Checklist" },
  { match: /toilet roll stickers/i, posName: "Toilet Roll Stickers" },
  { match: /showroom scent/i, posName: "Brand Scent" },
  { match: /children must be supervised signs/i, posName: "Children Must Be Supervised Poster" },
  { match: /tv slideshows/i, posName: "TV Slideshow (Customer-Facing Screens)" },

  { match: /tile specials leaflets/i, posName: "Tile Specials Leaflets" },
  { match: /a6 showroom exclusives labels/i, posName: "A6 Showroom Exclusives Labels" },
  { match: /trustpilot review stickers/i, posName: "Trustpilot Review Stickers" },

  { match: /in need of any pos assets which aren't on this list/i, special: "newIdea" },
  { match: /require any other support or replacement assets/i, special: "supportDetails" },
];

export function isMsFormsExport(wb: XLSX.WorkBook): boolean {
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[name], { defval: "" });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]);
    if (headers.some((h) => /which showroom/i.test(h)) && headers.includes("ID")) return true;
  }
  return false;
}

function cellText(v: any): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? "").trim();
}

export function parseMsFormsExcel(buffer: Buffer): ParsedAudit[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find((name) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[name], { defval: "" });
    return rows.length > 0 && Object.keys(rows[0]).includes("ID") && Object.keys(rows[0]).some((h) => /which showroom/i.test(h));
  });
  if (!sheetName) throw new Error("Couldn't find the Microsoft Forms response sheet in this file.");

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[sheetName], { defval: "" });
  if (rows.length === 0) throw new Error("This Microsoft Forms export has no responses to import.");

  // Resolve each mapping to the actual header text present in this export
  // once, rather than re-matching regexes per row.
  const headers = Object.keys(rows[0]);
  const resolved = MAPPINGS.map((m) => ({ ...m, header: headers.find((h) => m.match.test(h)) })).filter((m) => m.header);

  return rows.map((row, idx) => {
    const lineItems: ParsedLineItem[] = [];
    const unmappedNotes: string[] = [];
    let showroomName = "";
    let completedByName = "";
    let completedByEmail = "";
    let auditDate: string | null = null;
    let newIdeaText = "";
    let supportDetails = "";
    const photoFlags: Record<string, boolean> = {};

    for (const m of resolved) {
      const raw = cellText(row[m.header as string]);
      if ("special" in m) {
        if (m.special === "showroom") showroomName = raw;
        else if (m.special === "completedByName") completedByName = raw;
        else if (m.special === "completedByEmail") completedByEmail = raw;
        else if (m.special === "auditDate") auditDate = raw || null;
        else if (m.special === "newIdea") {
          if (raw && !/^(no|none|n\/a)\.?$/i.test(raw.trim())) newIdeaText = raw;
        } else if (m.special === "supportDetails") {
          if (raw && !/^(no|none|n\/a)\.?$/i.test(raw.trim())) supportDetails = raw;
        } else if (m.special.startsWith("unmapped:")) {
          const label = m.special.slice("unmapped:".length);
          if (raw && !/^(no|none|n\/a)\.?$/i.test(raw.trim())) unmappedNotes.push(`${label}: ${raw}`);
        }
      } else if ("photoForPosName" in m) {
        if (raw) photoFlags[m.photoForPosName] = true;
      } else if ("posName" in m) {
        const status = inferConditionStatus(raw);
        if (status) {
          const canonical = require("./parsedAudit").CANONICAL_POS_ITEMS.find((c: any) => c.name === m.posName);
          lineItems.push({
            category: canonical?.category || "",
            posName: m.posName,
            conditionStatus: status,
            comments: raw,
          });
        }
      } else if ("multiPosName" in m) {
        // One question, several catalogue items - each sub-item's own
        // regex decides whether the answer flagged it specifically as
        // short; anything answered but not flagged is Present-OK rather
        // than left with no data, since the respondent did address it.
        if (!raw) continue;
        for (const sub of m.multiPosName) {
          const status = sub.missingWhen.test(raw) ? "Missing" : "Present-OK";
          const canonical = require("./parsedAudit").CANONICAL_POS_ITEMS.find((c: any) => c.name === sub.name);
          lineItems.push({
            category: canonical?.category || "",
            posName: sub.name,
            conditionStatus: status,
            comments: status === "Missing" ? raw : "",
          });
        }
      }
    }

    lineItems.forEach((li) => {
      if (photoFlags[li.posName]) li.hasPhoto = true;
    });

    if (!showroomName) {
      throw new Error(`Response ${idx + 1}: "Which showroom are you reporting for?" is blank - can't file this without a showroom.`);
    }

    return {
      showroomName,
      auditDate,
      auditType: "Self-Reported (Monthly)",
      completedByName,
      completedByEmail,
      generalComments: unmappedNotes.join(" | "),
      supportRequired: !!supportDetails,
      supportDetails,
      lineItems,
      newIdeaText,
      sourceLabel: `${showroomName} (Microsoft Forms, ${auditDate || "no date"})`,
    };
  });
}
