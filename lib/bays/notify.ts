// Instant emails for the bay register (Round 28). Recipients come from Users &
// Access (no hard-coded addresses): store managers by their Site, the Layout
// Lead by role. Digests, reminders and escalations come in the next round.

import { listRecords, TABLES } from "@/lib/airtable";
import { sendEmail, emailShell, BRAND } from "@/lib/resend";
import type { ChangeView } from "./repo";

type U = { Name: string; Email: string; Role: string; Site?: string[]; Active?: boolean };

async function users(): Promise<U[]> {
  return (await listRecords<U>(TABLES.USERS)).map((r) => r.fields).filter((u) => u.Active === true && !!u.Email);
}

export async function storeManagerEmails(siteId: string) {
  return (await users()).filter((u) => u.Role === "Store Manager" && u.Site?.includes(siteId)).map((u) => u.Email);
}

export async function layoutLeadEmails() {
  return (await users()).filter((u) => u.Role === "Layout Lead").map((u) => u.Email);
}

function esc(s: string | null | undefined) {
  return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function itemList(c: ChangeView) {
  return `<ul>${c.items
    .map((i) =>
      i.action === "Add"
        ? `<li><b>Add</b> ${esc(i.newDescription)} (${esc(i.new_sku)})</li>`
        : i.action === "Remove"
        ? `<li><b>Remove</b> ${esc(i.oldDescription)}</li>`
        : `<li><b>Replace</b> ${esc(i.oldDescription)} <b>with</b> ${esc(i.newDescription)} (${esc(i.new_sku)})</li>`
    )
    .join("")}</ul>`;
}

/** Fails soft: a missing recipient or email error never blocks the change itself. */
export async function notifyChangeRaised(c: ChangeView, storeName: string, appHost?: string) {
  try {
    const link = appHost ? `<p><a href="https://${appHost}/bays/changes/${c.id}" style="color:${BRAND.pink};">Open the change</a></p>` : "";
    if (c.status === "Awaiting Ryan") {
      const to = await layoutLeadEmails();
      if (!to.length) return console.warn("No active Layout Lead user - change approval email not sent");
      await sendEmail(to, `Bay change to approve: ${c.bay_code} (${storeName})`, emailShell(
        `${storeName} has asked to change bay ${c.bay_code}`,
        `<p>Raised by ${esc(c.raised_by)}.</p>${itemList(c)}${c.note ? `<p>Note: ${esc(c.note)}</p>` : ""}<p>Approve or reject it on your bay desk.</p>${link}`
      ));
    } else {
      const to = await storeManagerEmails(c.store_id);
      if (!to.length) return console.warn(`No store manager login for site ${c.store_id} - change email not sent`);
      await sendEmail(to, `Display change for bay ${c.bay_code}`, emailShell(
        `Please change bay ${c.bay_code}`,
        `<p>${esc(c.raised_by)} has changed the layout of bay ${c.bay_code}.</p>${itemList(c)}${c.note ? `<p>Note: ${esc(c.note)}</p>` : ""}
         ${c.needs_order ? "<p>New stock is being ordered for this change.</p>" : ""}
         <p>Once it's done, open the change, tick it off and take a new photo of the bay${c.due_at ? ` by <b>${esc(c.due_at)}</b>` : ""}.</p>${link}`
      ));
    }
  } catch (e) {
    console.error("Bay change email failed:", e);
  }
}
