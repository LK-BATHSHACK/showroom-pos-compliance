// Consumables Request feature (added 10 Sep 2026, Lorraine: "add a
// consumables request section for managers to be able to request items -
// when they submit a request it must go to Chris Agnew"). Three new tables:
//   - Consumable Items: the catalog (toilet paper, printer paper, cash
//     envelopes, cleaning products, etc). Store Managers pick from this list
//     rather than free-typing, so the dashboard can report cleanly on "who's
//     ordering what". Chris/Admin can add more rows in Airtable any time -
//     nothing here needs a code change to add a new item.
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

import { listRecords, createRecords, updateRecords, TABLES } from "./airtable";
import { sendEmail, emailShell } from "./resend";

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
       <p>Review and update its status in the app's Consumables tab.</p>`
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
