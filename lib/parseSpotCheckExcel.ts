import * as XLSX from "xlsx";
import { ParsedAudit, ParsedLineItem, inferConditionStatus } from "./parsedAudit";

// Parses Jordan's "Showrooms POS Spot Check" workbook - the Group A
// in-person reference/tracker. Layout: one sheet per region per month
// (e.g. "NI - Aug 2026"), row 3 is the header ("Signage", "Example /
// correct allocation", then one column per showroom), each POS item is a
// row, section names ("POS ON BAYS", "SALES POS", ...) are their own
// rows with only column A filled. Every showroom's column starts out
// identical to the reference column and Jordan overwrites it with what
// he actually finds - see lib/parsedAudit.ts's inferConditionStatus for
// how free-text deviations get turned into a ConditionStatus.
//
// The bare "NI"/"ROI" tabs are the evergreen template Jordan copies each
// month - never treated as data. Only "<Region> - <label>" tabs are
// parsed. "Feedback & New Ideas" is intentionally left alone per
// Lorraine's steer: that's Jordan's own working notes, not something
// this pipeline ingests.

const LABEL_MAP: Record<string, string | null> = {
  "product & bay pricing": null, // "TBC - display standard not yet finalised" - not a real target yet
  "tile pricing stickers": "Tile Pricing Stickers",
  "variety of bay stickers": "Bay Stickers (Variety)",
  "bay number duck stickers": "Bay Number Duck Stickers",
  "duck stickers (general branded stickers)": "Duck Stickers (General)",
  "star wobblers": "Star Wobblers",
  "sale wobbler ducks": "Sale Wobbler Ducks",
  "monthly sale posters (a3)": "Monthly Sale Posters (A3)",
  "a3 clear sale frames": "A3 Clear Sale Frames",
  "review / pop-up trustpilot tent cards": "Review / Pop-up Trustpilot Tent Cards",
  "showroom exclusives a1 frame & easel": "Showroom Exclusives A1 Frame & Easel",
  "showroom-only graphics": "Showroom-Only Graphics",
  "tv slideshow (customer-facing screens)": "TV Slideshow (Customer-Facing Screens)",
  "entrance a1 frames (where fitted)": "Entrance A1 Frames",
  "wobble board (outside showroom)": "Wobble Board (Outside Showroom)",
  "framed awards": "Framed Awards",
  "trustpilot poster (a3)": "Trustpilot Poster (A3)",
  "price promise poster (front-middle of desk)": "Price Promise Poster",
  "qr code business card + review qr code (front of desk)": "QR Code Business Card + Review QR",
  "returns policy pop-up (kept under desk)": "Returns Policy Pop-up",
  "desk tidy & clutter-free": "Desk Tidy & Clutter-Free",
  "framed customer photos": "Framed Customer Photos",
  "toilet roll stickers": "Toilet Roll Stickers",
  "toilet cleaning checklist": "Toilet Cleaning Checklist",
  "brand scent": "Brand Scent",
  "children must be supervised poster": "Children Must Be Supervised Poster",
};

function norm(s: string): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Known showroom-column-name aliases in this tracker that don't match the
// Airtable Showroom's own name field directly - confirmed with Lorraine
// 31 Aug 2026:
// - "Tileshack Huttons" is Shore Rd. (full name "Shore Road - Tileshack"),
//   not a separate/missing showroom. This also resolves what had been
//   logged as a coverage gap for Shore Rd. in the tracker - it was never
//   missing, just present under this column name instead.
// - "Belfast" is Dargan - same pattern, an old/informal column name for an
//   existing Airtable showroom rather than a missing one.
const SHOWROOM_NAME_ALIASES: Record<string, string> = {
  "tileshack huttons": "Shore Rd.",
  "belfast": "Dargan",
};

function resolveShowroomName(rawName: string): string {
  return SHOWROOM_NAME_ALIASES[norm(rawName)] ?? rawName;
}

export function isSpotCheckWorkbook(wb: XLSX.WorkBook): boolean {
  const hasFeedbackTab = wb.SheetNames.includes("Feedback & New Ideas");
  const hasRegionTab = wb.SheetNames.some((n) => /^(NI|ROI)\b/i.test(n));
  return hasFeedbackTab && hasRegionTab;
}

function dataSheetNames(wb: XLSX.WorkBook): string[] {
  // "<Region> - <anything>", excludes the bare evergreen "NI"/"ROI" tabs.
  return wb.SheetNames.filter((n) => /^(NI|ROI)\s*-\s*.+/i.test(n));
}

export function parseSpotCheckExcel(buffer: Buffer): ParsedAudit[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetNames = dataSheetNames(wb);
  if (sheetNames.length === 0) {
    throw new Error('No dated region sheets found (expected something like "NI - Aug 2026" or "ROI - Aug 2026").');
  }

  const results: ParsedAudit[] = [];
  const designerEmail = process.env.DESIGNER_NOTIFY_EMAIL || "";

  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

    const headerRowIdx = rows.findIndex((r) => norm(r[0]) === "signage");
    if (headerRowIdx === -1) continue; // not a shape we recognise, skip this tab
    const headerRow = rows[headerRowIdx];
    const showroomCols: { col: number; name: string }[] = [];
    for (let c = 2; c < headerRow.length; c++) {
      const rawName = String(headerRow[c] ?? "").trim();
      if (rawName) showroomCols.push({ col: c, name: resolveShowroomName(rawName) });
    }

    const completedDateRaw = String(rows[0]?.[1] ?? "").trim();
    const auditDate = completedDateRaw || null;

    // Per-showroom accumulators.
    const lineItemsByShowroom: Record<string, ParsedLineItem[]> = {};
    showroomCols.forEach((s) => (lineItemsByShowroom[s.name] = []));

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const label = String(row[0] ?? "").trim();
      const reference = String(row[1] ?? "").trim();
      if (!label) continue;
      if (!reference) continue; // section header row (e.g. "SALES POS") - not an item

      const key = norm(label);
      if (!(key in LABEL_MAP)) continue; // unrecognised row - skip rather than guess
      const posName = LABEL_MAP[key];
      if (!posName) continue; // deliberately-skipped item (e.g. TBC reference)
      if (/^n\/a\b/i.test(reference)) continue; // not applicable in this region

      const canonical = require("./parsedAudit").CANONICAL_POS_ITEMS.find((c: any) => c.name === posName);

      for (const s of showroomCols) {
        const observed = String(row[s.col] ?? "").trim();
        if (!observed) continue; // not yet filled in for this showroom - don't false-flag
        const status = inferConditionStatus(observed, reference);
        if (!status) continue;
        lineItemsByShowroom[s.name].push({
          category: canonical?.category || "",
          posName,
          conditionStatus: status,
          comments: status === "Present-OK" ? "" : observed,
        });
      }
    }

    for (const s of showroomCols) {
      const items = lineItemsByShowroom[s.name];
      if (items.length === 0) continue; // nothing filled in yet for this showroom this round
      results.push({
        showroomName: s.name,
        auditDate,
        auditType: "Physical (Group A)",
        completedByName: "Jordan",
        completedByEmail: designerEmail,
        generalComments: "",
        supportRequired: false,
        supportDetails: "",
        lineItems: items,
        sourceLabel: `${s.name} (${sheetName})`,
      });
    }
  }

  return results;
}
