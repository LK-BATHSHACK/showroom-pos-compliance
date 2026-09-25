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
// Status workflow (confirmed with Lorraine 10 Sep 2026, renamed 25 Sep 2026):
// Requested -> Sent -> Fulfilled. "Sent" replaced "Ordered" (Lorraine: "can i
// have the status changed to say Sent rather than ordered"); any old
// "Ordered" value is read back as "Sent". Chris/Operations moves a request to
// Sent by sending the store a delivery update (packages, method, timing,
// photo - sendConsumablesUpdate below); the store marks it Fulfilled with
// "Mark as received" when it arrives (markConsumablesReceived). The status lives on the Consumables Requests record (the whole
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

import { listRecords, createRecords, updateRecords, getRecord, uploadAttachment, TABLES, type AttachmentUpload } from "./airtable";
import { sendEmail, emailShell, BRAND } from "./resend";

export const CONSUMABLES_STATUSES = ["Requested", "Sent", "Fulfilled"] as const;
export const DELIVERY_METHODS = ["Van drop", "DPD", "Post", "Other courier", "Collection"] as const;

/** Old records may still say "Ordered" - show them as "Sent". */
export function normaliseStatus(s: string | undefined): string {
  if (!s) return "Requested";
  return s === "Ordered" ? "Sent" : s;
}

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
  update: ConsumablesUpdate | null;
  receivedByName: string | null;
  receivedDate: string | null;
};

export type ConsumablesUpdate = {
  message: string | null;
  deliveryMethod: string | null;
  expectedDelivery: string | null;
  packageCount: number | null;
  photos: { url: string; thumbUrl: string; filename: string }[];
  sentByName: string | null;
  sentDate: string | null;
};

type RequestFields = {
  Name: string;
  Site?: string[];
  RequestedByName?: string;
  RequestedByEmail?: string;
  DateRequested?: string;
  Status?: string;
  StatusUpdatedDate?: string;
  StatusUpdatedByName?: string;
  Notes?: string;
  UpdateMessage?: string;
  DeliveryMethod?: string;
  ExpectedDelivery?: string;
  PackageCount?: number;
  UpdatePhotos?: { url?: string; filename?: string; thumbnails?: { large?: { url: string } } }[];
  UpdateSentByName?: string;
  UpdateSentDate?: string;
  ReceivedByName?: string;
  ReceivedDate?: string;
};

function updateFromFields(f: RequestFields): ConsumablesUpdate | null {
  const has = f.UpdateSentDate || f.UpdateMessage || f.DeliveryMethod || f.ExpectedDelivery || f.PackageCount || (f.UpdatePhotos || []).length;
  if (!has) return null;
  return {
    message: f.UpdateMessage || null,
    deliveryMethod: f.DeliveryMethod || null,
    expectedDelivery: f.ExpectedDelivery || null,
    packageCount: typeof f.PackageCount === "number" ? f.PackageCount : null,
    photos: (f.UpdatePhotos || [])
      .filter((p) => p.url)
      .map((p) => ({ url: p.url as string, thumbUrl: p.thumbnails?.large?.url || (p.url as string), filename: p.filename || "photo.jpg" })),
    sentByName: f.UpdateSentByName || null,
    sentDate: f.UpdateSentDate || null,
  };
}

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
    listRecords<RequestFields>(TABLES.CONSUMABLES_REQUESTS, { sort: [{ field: "DateRequested", direction: "desc" }] }),
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
      status: normaliseStatus(r.fields.Status),
      statusUpdatedDate: r.fields.StatusUpdatedDate || null,
      statusUpdatedByName: r.fields.StatusUpdatedByName || null,
      notes: r.fields.Notes || null,
      lines: linesByRequestId.get(r.id) || [],
      update: updateFromFields(r.fields),
      receivedByName: r.fields.ReceivedByName || null,
      receivedDate: r.fields.ReceivedDate || null,
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

/** Site + requester of one request - used to check a Store Manager is only acting on their own site's requests. */
export async function getConsumablesRequestSummary(id: string): Promise<{ siteId: string | null; status: string; requestedByEmail: string; requestedByName: string; name: string } | null> {
  try {
    const r = await getRecord<RequestFields>(TABLES.CONSUMABLES_REQUESTS, id);
    return {
      siteId: r.fields.Site?.[0] || null,
      status: normaliseStatus(r.fields.Status),
      requestedByEmail: r.fields.RequestedByEmail || "",
      requestedByName: r.fields.RequestedByName || "",
      name: r.fields.Name || "",
    };
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Chris/Operations' delivery update to the store (Lorraine, 25 Sep 2026: "Is
 * there nowhere to be able to respond to this? Would love to send them an
 * image covering how many packages they are getting ... and roughly when and
 * how e.g. 'on van drop for next week' or 'arriving by DPD next day'").
 *
 * Saves the update on the request, replaces any earlier update photos, moves
 * the request to "Sent" (unless it's already Fulfilled), and emails the
 * person who made the request with the details and the photos attached.
 * Sending again overwrites the previous update and emails again.
 */
export async function sendConsumablesUpdate(input: {
  id: string;
  message: string;
  deliveryMethod: string;
  expectedDelivery: string;
  packageCount: number | null;
  photos: AttachmentUpload[];
  sentByName: string;
  appHost?: string;
}): Promise<{ emailed: boolean; photoUploadErrors: string[] }> {
  const existing = await getRecord<RequestFields>(TABLES.CONSUMABLES_REQUESTS, input.id);
  const today = new Date().toISOString().slice(0, 10);
  const currentStatus = normaliseStatus(existing.fields.Status);

  const fields: Record<string, any> = {
    UpdateMessage: input.message,
    DeliveryMethod: input.deliveryMethod || null,
    ExpectedDelivery: input.expectedDelivery,
    PackageCount: input.packageCount,
    UpdateSentByName: input.sentByName,
    UpdateSentDate: today,
  };
  if (input.photos.length) fields.UpdatePhotos = []; // new photos replace the old ones
  if (currentStatus !== "Fulfilled") {
    fields.Status = "Sent";
    fields.StatusUpdatedDate = today;
    fields.StatusUpdatedByName = input.sentByName;
  }
  await updateRecords(TABLES.CONSUMABLES_REQUESTS, [{ id: input.id, fields }]);

  const photoUploadErrors: string[] = [];
  for (const p of input.photos) {
    try {
      await uploadAttachment(input.id, "UpdatePhotos", p);
    } catch (err) {
      console.error(err);
      photoUploadErrors.push(p.filename);
    }
  }

  const to = existing.fields.RequestedByEmail;
  if (!to) return { emailed: false, photoUploadErrors };

  const siteName = (existing.fields.Name || "").replace(/ - \d{4}-\d{2}-\d{2}$/, "") || "your store";
  const firstName = (existing.fields.RequestedByName || "").trim().split(" ")[0] || "there";
  const rows: string[] = [];
  if (input.packageCount) rows.push(`<strong>Packages:</strong> ${input.packageCount}`);
  if (input.deliveryMethod) rows.push(`<strong>Coming by:</strong> ${escapeHtml(input.deliveryMethod)}`);
  if (input.expectedDelivery) rows.push(`<strong>Expected:</strong> ${escapeHtml(input.expectedDelivery)}`);
  const link = input.appHost
    ? `<p style="margin:24px 0;"><a href="https://${input.appHost}/consumables" style="background:${BRAND.pink}; color:#fff; padding:12px 20px; text-decoration:none; font-weight:bold; border-radius:4px;">Mark as received when it arrives</a></p>`
    : "";
  await sendEmail(
    to,
    `Your consumables order is on its way - ${siteName}`,
    emailShell(
      "Consumables Update",
      `<p>Hi ${escapeHtml(firstName)},</p>
       <p>Your consumables request from ${existing.fields.DateRequested || "recently"} has been sent.</p>
       ${rows.length ? `<p>${rows.join("<br/>")}</p>` : ""}
       ${input.message ? `<p>${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>` : ""}
       ${input.photos.length ? `<p style="color:${BRAND.grey}; font-size:13px;">Photo${input.photos.length === 1 ? "" : "s"} of what's coming attached, so you can check it's all there if the driver drops it off.</p>` : ""}
       ${link}
       <p style="color:${BRAND.grey}; font-size:13px;">Sent by ${escapeHtml(input.sentByName)}.</p>`
    ),
    input.photos.map((p) => ({ filename: p.filename, content: Buffer.from(p.base64, "base64") }))
  );
  return { emailed: true, photoUploadErrors };
}

/** Store confirms the order arrived - sets Fulfilled and records who/when. */
export async function markConsumablesReceived(id: string, receivedByName: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await updateRecords(TABLES.CONSUMABLES_REQUESTS, [
    {
      id,
      fields: {
        Status: "Fulfilled",
        StatusUpdatedDate: today,
        StatusUpdatedByName: receivedByName,
        ReceivedByName: receivedByName,
        ReceivedDate: today,
      },
    },
  ]);
}
