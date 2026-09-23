// Consumables Request feature (added 10 Sep 2026, Lorraine: "add a
// consumables request section for managers to be able to request items -
// when they submit a request it must go to Chris Agnew"). Three new tables:
//   - Consumable Items: the catalog (toilet roll, blue roll, glass cleaner,
//     hoover bags, micro fibre cloths, hand soap, A4 paper, printer toners,
//     cash envelopes, etc). Store Managers pick from this list rather than
//     free-typing, so the dashboard can report cleanly on "who's ordering
//     what".
//   - Consumables Requests: one row per "basket" a manager submits (one
//     request can contain several items - Lorraine confirmed this should be
//     a single submission, not one request per item).
//   - Consumables Request Lines: one row per item within a basket
//     (Request -> Item + Quantity).
//
// Status workflow (confirmed with Lorraine 10 Sep 2026): Requested ->
// Ordered -> Fulfilled, lives on the Consumables Requests record (the whole
// basket moves together, not per line item - simplest match for "order the
// basket, mark it done once it all turns up").
//
// Catalog management (added 10 Sep 2026, Lorraine: "allow admin to add in
// more when needed with an add button") - Admin can add a new catalog item
// straight from the Dashboard tab (see ConsumablesDashboard.tsx and
// app/api/consumable-items/route.ts), rather than needing Airtable access.
// Category is picked from the existing fixed list (CONSUMABLE_CATEGORIES,
// mirroring the live Category field's choices) rather than free-typed, so a
// new item still slots into the existing "top items"/"by category" reporting
// cleanly - it doesn't invent new categories.

import { listRecords, createRecords, updateRecords, TABLES } from "./airtable";
import { sendEmail, emailShell, BRAND } from "./resend";

export const CONSUMABLE_CATEGORIES = [
  "Toilet & Washroom",
  "Stationery & Printing",
  "Cash Office",
  "Cleaning & Hygiene",
  "Other",
] as const;

export type ConsumableItem = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  active: boolean;
};

export type ConsumablesRequestLine = {
  id: string;
  itemId: string | null;
  itemName: string;
  quantity: number;
  notes: string | null;
};

export type ConsumablesRequestRow = {
  id: string;
  siteId: string | null;
  siteName: string;
  requestedByName: string;
  requestedByEmail: string;
  dateRequested: string;
  status: string;
  statusUpdatedDate: string | null;
  statusUpdatedByName: string | null;
  notes: string | null;
  lines: ConsumablesRequestLine[];
};

export async function fetchConsumableCatalog(): Promise<ConsumableItem[]> {
  const records = await listRecords<{ Name: string; Category?: string; Unit?: string; Active?: boolean }>(
    TABLES.CONSUMABLE_ITEMS
  );
  return records
    .filter((r) => r.fields.Active === true)
    .map((r) => ({
      id: r.id,
      name: r.fields.Name,
      category: r.fields.Category || null,
      unit: r.fields.Unit || null,
      active: true,
    }))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
}

/** Fetches every Consumables Request with its line items joined in, newest first. Used by the dashboard - no date-range param, the dashboard filters client-side so KPIs can react instantly without a re-fetch. */
export async function fetchConsumablesRequests(): Promise<ConsumablesRequestRow[]> {
  const [requests, lines, items, sites] = await Promise.all([
    listRecords<{
      Name: string;
      Site?: string[];
      RequestedByName?: string;
      RequestedByEmail?: string;
      DateRequested?: string;
      Status?: string;
      StatusUpdatedDate?: string;
      StatusUpdatedByName?: string;
      Notes?: string;
    }>(TABLES.CONSUMABLES_REQUESTS, { sort: [{ field: "DateRequested", direction: "desc" }] }),
    listRecords<{ Request?: string[]; Item?: string[]; Quantity?: number; Notes?: string }>(TABLES.CONSUMABLES_REQUEST_LINES),
    listRecords<{ Name: string }>(TABLES.CONSUMABLE_ITEMS),
    listRecords<{ SiteName: string }>(TABLES.SITES),
  ]);

  const itemNameById = new Map(items.map((i) => [i.id, i.fields.Name]));
  const siteNameById = new Map(sites.map((s) => [s.id, s.fields.SiteName]));

  const linesByRequestId = new Map<string, ConsumablesRequestLine[]>();
  lines.forEach((l) => {
    const requestId = l.fields.Request?.[0];
    if (!requestId) return;
    const itemId = l.fields.Item?.[0] || null;
    const line: ConsumablesRequestLine = {
      id: l.id,
      itemId,
      itemName: (itemId && itemNameById.get(itemId)) || "-",
      quantity: l.fields.Quantity ?? 0,
      notes: l.fields.Notes || null,
    };
    const existing = linesByRequestId.get(requestId) || [];
    existing.push(line);
    linesByRequestId.set(requestId, existing);
  });

  return requests.map((r) => {
    const siteId = r.fields.Site?.[0] || null;
    return {
      id: r.id,
      siteId,
      siteName: (siteId && siteNameById.get(siteId)) || "-",
      requestedByName: r.fields.RequestedByName || "-",
      requestedByEmail: r.fields.RequestedByEmail || "",
      dateRequested: r.fields.DateRequested || "",
      status: r.fields.Status || "Requested",
      statusUpdatedDate: r.fields.StatusUpdatedDate || null,
      statusUpdatedByName: r.fields.StatusUpdatedByName || null,
      notes: r.fields.Notes || null,
      lines: linesByRequestId.get(r.id) || [],
    };
  });
}

export type NewConsumablesRequestLine = { itemId: string; quantity: number; notes?: string };

/** Creates one Consumables Request (basket) + its line items, and emails Chris Agnew. Returns the created request id. */
export async function createConsumablesRequest(input: {
  siteId: string;
  siteName: string;
  requestedByName: string;
  requestedByEmail: string;
  notes?: string;
  lines: NewConsumablesRequestLine[];
  itemNameById: Map<string, string>;
  // Host the request came in on (from the API route's req.headers.get("host")),
  // used to build a "review this" link in Chris's email - same appHost pattern
  // lib/hsSubmission.ts's sendSubmissionSummaryEmail already uses. Optional so
  // this still works (just without the link) if a caller doesn't have one.
  appHost?: string;
}): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  const [created] = await createRecords(TABLES.CONSUMABLES_REQUESTS, [
    {
      Name: `${input.siteName} - ${today}`,
      Site: [input.siteId],
      RequestedByName: input.requestedByName,
      RequestedByEmail: input.requestedByEmail,
      DateRequested: today,
      Status: "Requested",
      Notes: input.notes || "",
    },
  ]);

  await createRecords(
    TABLES.CONSUMABLES_REQUEST_LINES,
    input.lines.map((l) => {
      const itemName = input.itemNameById.get(l.itemId) || "Item";
      return {
        Name: `${itemName} x ${l.quantity}`,
        Request: [created.id],
        Item: [l.itemId],
        Quantity: l.quantity,
        Notes: l.notes || "",
      };
    })
  );

  const notifyEmail = process.env.CONSUMABLES_NOTIFY_EMAIL || "chris.agnew@bathshack.com";
  const itemListHtml = input.lines
    .map((l) => `<li>${input.itemNameById.get(l.itemId) || "Item"} &times; ${l.quantity}${l.notes ? ` - <em>${l.notes}</em>` : ""}</li>`)
    .join("");
  // No per-request detail page exists (yet) - Consumables Requests are all
  // reviewed together on the Dashboard tab, newest first, so linking there
  // lands Chris directly on this request at the top rather than leaving him
  // to find the app himself. Same appHost -> https://<host>/... link pattern
  // lib/hsSubmission.ts's submission-summary email already uses.
  const reviewLink = input.appHost
    ? `<p style="margin-top:20px;"><a href="https://${input.appHost}/consumables" style="color:${BRAND.pink};">Review this request</a></p>`
    : "";
  await sendEmail(
    notifyEmail,
    `New consumables request: ${input.siteName}`,
    emailShell(
      "New Consumables Request",
      `<p><strong>Site:</strong> ${input.siteName}<br/>
       <strong>Requested by:</strong> ${input.requestedByName} (${input.requestedByEmail || "no email given"})<br/>
       <strong>Date:</strong> ${today}</p>
       <p><strong>Items:</strong></p>
       <ul>${itemListHtml}</ul>
       ${input.notes ? `<p><strong>Note from the site:</strong> ${input.notes}</p>` : ""}
       ${reviewLink}`
    )
  );

  return created.id;
}

export async function updateConsumablesRequestStatus(id: string, status: string, updatedByName: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await updateRecords(TABLES.CONSUMABLES_REQUESTS, [
    { id, fields: { Status: status, StatusUpdatedDate: today, StatusUpdatedByName: updatedByName } },
  ]);
}

/** Adds a new item to the Consumable Items catalog (Admin, via the Dashboard's "Add item" form). */
export async function createConsumableItem(input: { name: string; category: string; unit?: string }): Promise<ConsumableItem> {
  const [created] = await createRecords<{ Name: string; Category?: string; Unit?: string; Active?: boolean }>(
    TABLES.CONSUMABLE_ITEMS,
    [{ Name: input.name.trim(), Category: input.category, Unit: (input.unit || "").trim(), Active: true }]
  );
  return {
    id: created.id,
    name: created.fields.Name,
    category: created.fields.Category || null,
    unit: created.fields.Unit || null,
    active: true,
  };
}

/**
 * Edits an existing catalog item (Admin, via the Dashboard's Edit/Remove
 * controls - Lorraine, 23 Sep 2026: "how do we delete or edit existing
 * options?"). "Remove" sets Active = false rather than deleting the record,
 * so past requests that include the item keep their item name and still show
 * in the Dashboard's history/patterns - it just stops appearing on the
 * request form.
 */
export async function updateConsumableItem(
  id: string,
  patch: { name?: string; category?: string; unit?: string; active?: boolean }
): Promise<void> {
  const fields: Record<string, any> = {};
  if (patch.name !== undefined) fields.Name = patch.name.trim();
  if (patch.category !== undefined) fields.Category = patch.category;
  if (patch.unit !== undefined) fields.Unit = patch.unit.trim();
  if (patch.active !== undefined) fields.Active = patch.active;
  await updateRecords(TABLES.CONSUMABLE_ITEMS, [{ id, fields }]);
}
