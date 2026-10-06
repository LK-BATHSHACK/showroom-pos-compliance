// "Has it arrived?" reminder for Store Managers with an open consumables
// order (Lorraine, 6 Oct 2026: "yes go ahead" to a reminder email, after
// noticing every September order was still on Sent - stores weren't marking
// them received, and since the one-open-order rule, an unmarked order also
// stops them ordering again).
//
// Who: the person who made the request (RequestedByEmail), for every request
// that's been on "Sent" for at least CONSUMABLES_REMINDER_MIN_DAYS. Requests
// still on "Requested" aren't chased - the store can't be expected to confirm
// something Chris hasn't sent yet (that's Chris's queue).
// When: weekday mornings only, on CONSUMABLES_REMINDER_WEEKDAYS (Mon + Thu),
// so it never lands at a weekend and nobody is emailed daily. Stateless on
// purpose - it works off today's date and the request's sent date, so no new
// Airtable field is needed to remember "already reminded". Once the store
// marks the order received it drops out of the list automatically.
// One email per person, listing all their open orders.

import { sendEmail, emailShell, BRAND } from "./resend";
import { fetchConsumablesRequests } from "./consumables";

/** Days an order must have been on Sent before the first nudge. */
export const CONSUMABLES_REMINDER_MIN_DAYS = 3;
/** Days of the week reminders go out on (0 = Sunday ... 6 = Saturday): Monday and Thursday. */
export const CONSUMABLES_REMINDER_WEEKDAYS = [1, 4];

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type ConsumablesReminderResult = { sent: string[]; ordersChased: number };

/**
 * Called daily by the reminders cron; does nothing unless `today` (a London
 * YYYY-MM-DD date) is one of the reminder weekdays. `appOrigin` builds the
 * "Mark as received" button; the button is left out if it's unknown.
 */
export async function runConsumablesReceivedReminders(today: string, appOrigin?: string): Promise<ConsumablesReminderResult> {
  const result: ConsumablesReminderResult = { sent: [], ordersChased: 0 };
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  if (!CONSUMABLES_REMINDER_WEEKDAYS.includes(weekday)) return result;

  const requests = await fetchConsumablesRequests();
  const byPerson = new Map<string, { name: string; orders: typeof requests }>();
  for (const r of requests) {
    if (r.status !== "Sent" || !r.requestedByEmail) continue;
    const sentOn = r.update?.sentDate || r.statusUpdatedDate || r.dateRequested;
    if (!sentOn || daysBetween(sentOn, today) < CONSUMABLES_REMINDER_MIN_DAYS) continue;
    const key = r.requestedByEmail.toLowerCase();
    const entry = byPerson.get(key) || { name: r.requestedByName, orders: [] };
    entry.orders.push(r);
    byPerson.set(key, entry);
  }

  const button = appOrigin
    ? `<p style="margin:24px 0;"><a href="${appOrigin}/consumables" style="background:${BRAND.pink}; color:#fff; padding:12px 20px; text-decoration:none; font-weight:bold; border-radius:4px;">Mark as received</a></p>`
    : "";

  for (const [email, { name, orders }] of byPerson) {
    const firstName = escapeHtml((name || "").trim().split(" ")[0] || "there");
    const list = orders
      .map((o) => {
        const items = o.lines.map((l) => escapeHtml(l.itemName)).join(", ");
        const how = [o.update?.deliveryMethod, o.update?.expectedDelivery].filter(Boolean).map((x) => escapeHtml(x as string)).join(", ");
        return `<li><strong>${escapeHtml(o.siteName)}</strong> - requested ${o.dateRequested}${items ? ` (${items})` : ""}${how ? ` - ${how}` : ""}</li>`;
      })
      .join("");
    const plural = orders.length > 1;
    await sendEmail(
      email,
      `Has your consumables order arrived? - ${orders[0].siteName}`,
      emailShell(
        "Has Your Order Arrived?",
        `<p>Hi ${firstName},</p>
         <p>${plural ? "These orders were" : "This order was"} sent to you, but ${plural ? "haven't" : "hasn't"} been marked as received yet:</p>
         <ul>${list}</ul>
         <p>If ${plural ? "they've" : "it's"} arrived, please tap the button below. <strong>You can't send a new consumables request until ${plural ? "they're" : "it's"} marked as received.</strong></p>
         ${button}
         <p style="color:${BRAND.grey}; font-size:13px;">Not arrived yet? Let Chris Agnew know and ignore this email - we'll check in again on Monday or Thursday.</p>`
      )
    );
    result.sent.push(email);
    result.ordersChased += orders.length;
  }
  return result;
}
