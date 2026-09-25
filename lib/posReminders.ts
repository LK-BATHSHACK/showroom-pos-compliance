// Monthly POS check reminder + overdue emails for Store Managers
// (Lorraine, 23 Sep 2026: "remind them a few days before the 28th of each
// month that they must submit the POS check. Also send any store manager an
// overdue one if it goes past 28th and if the reminder email falls on a
// Sunday make sure it goes a day early so it never falls when they are off").
//
// "Submitted" counts by lib/posSchedule.ts periodForAuditDate(): checks dated
// 1-7 Sep 2026 were the old round and count as August's, not September's.
//
// Recipients come straight from Users & Access - every Active user with
// Role = "Store Manager" and a Site where POSChecklistApplies is ticked - so
// adding/removing a manager in the app is all it takes, no code change and no
// need to also fill in Showrooms.ShowroomManagerEmail.
//
// "Submitted" = an Audit (the table every POS Check lands in, whether
// in-tool or via the Microsoft Forms Excel upload) linked to the manager's
// showroom, dated in the same calendar month as the deadline, that ISN'T one
// of Jordan's in-person spot checks ("Physical (Group A)") - his visit
// doesn't count as the store doing its own monthly check.

import { listRecords, TABLES } from "./airtable";
import { sendEmail, emailShell, BRAND } from "./resend";
import {
  POS_MONTHLY_DUE_DAY,
  SPOT_CHECK_AUDIT_TYPE,
  dueDateFor,
  reminderDateFor,
  overdueDateFor,
  prevPeriod,
  periodForAuditDate,
  POS_SCHEDULE_START,
} from "./posSchedule";

// Schedule rules (28th due date, 25th reminder / 18th in December, Sunday
// shifts, September 2026 start) live in lib/posSchedule.ts so the "Next due"
// date on the dashboard follows exactly the same rules as these emails.
export { POS_MONTHLY_DUE_DAY, londonToday, reminderDateFor, overdueDateFor } from "./posSchedule";

/** Which email (if any) goes out today, and for which month's deadline. */
export function whatIsDueToday(today: string): { kind: "reminder" | "overdue"; period: string } | null {
  const thisPeriod = today.slice(0, 7);
  if (thisPeriod < POS_SCHEDULE_START.slice(0, 7)) return null;
  if (reminderDateFor(thisPeriod) === today) return { kind: "reminder", period: thisPeriod };
  // The overdue date can spill into the next month (Feb 28 -> 1 Mar, or a
  // Sunday shift), so check last month's deadline as well as this month's.
  for (const p of [thisPeriod, prevPeriod(thisPeriod)]) {
    if (overdueDateFor(p) === today) return { kind: "overdue", period: p };
  }
  return null;
}

function formatLongDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

function periodLabel(period: string): string {
  return new Date(period + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// ---- Data + sending ----

type ManagerTarget = { name: string; email: string; siteName: string; showroomId: string };

async function fetchStoreManagerTargets(): Promise<ManagerTarget[]> {
  const [users, sites] = await Promise.all([
    listRecords<{ Name?: string; Email?: string; Role?: string; Site?: string[]; Active?: boolean }>(TABLES.USERS),
    listRecords<{ SiteName: string; Active?: boolean; POSChecklistApplies?: boolean; SourceShowroom?: string[] }>(TABLES.SITES),
  ]);
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const targets: ManagerTarget[] = [];
  for (const u of users) {
    // Airtable omits unticked checkboxes, so only an explicit `true` counts (same rule as login).
    if (u.fields.Role !== "Store Manager" || u.fields.Active !== true || !u.fields.Email) continue;
    const site = u.fields.Site?.[0] ? siteById.get(u.fields.Site[0]) : undefined;
    if (!site || site.fields.Active === false || site.fields.POSChecklistApplies !== true) continue;
    const showroomId = site.fields.SourceShowroom?.[0];
    if (!showroomId) continue;
    targets.push({ name: u.fields.Name?.trim() || "there", email: u.fields.Email, siteName: site.fields.SiteName, showroomId });
  }
  return targets;
}

async function showroomIdsSubmittedIn(period: string): Promise<Set<string>> {
  const audits = await listRecords<{ Showroom?: string[]; AuditDate?: string; AuditType?: string }>(TABLES.AUDITS);
  return new Set(
    audits
      .filter((a) => !!a.fields.AuditDate && periodForAuditDate(a.fields.AuditDate) === period && a.fields.AuditType !== SPOT_CHECK_AUDIT_TYPE)
      .flatMap((a) => a.fields.Showroom || [])
  );
}

export type PosReminderResult = {
  kind: "reminder" | "overdue" | null;
  period: string | null;
  sent: string[];
  skippedAlreadySubmitted: string[];
};

/**
 * Called daily by the reminders cron. Does nothing unless today is a
 * reminder or overdue date. `appOrigin` (e.g. "https://pos-compliance.bathshapp.com")
 * is used for the "Complete your POS check" button; omitted if unknown.
 */
export async function runPosMonthlyReminders(today: string, appOrigin?: string): Promise<PosReminderResult> {
  const due = whatIsDueToday(today);
  if (!due) return { kind: null, period: null, sent: [], skippedAlreadySubmitted: [] };

  const [targets, submitted] = await Promise.all([fetchStoreManagerTargets(), showroomIdsSubmittedIn(due.period)]);
  const deadline = dueDateFor(due.period);
  const button = appOrigin
    ? `<p style="margin:24px 0;"><a href="${appOrigin}/pos-check" style="background:${BRAND.pink}; color:#fff; padding:12px 20px; text-decoration:none; font-weight:bold; border-radius:4px;">Complete your POS check</a></p>`
    : "";

  const result: PosReminderResult = { kind: due.kind, period: due.period, sent: [], skippedAlreadySubmitted: [] };

  for (const t of targets) {
    if (submitted.has(t.showroomId)) {
      result.skippedAlreadySubmitted.push(t.siteName);
      continue;
    }
    const firstName = t.name.split(" ")[0];
    if (due.kind === "reminder") {
      await sendEmail(
        t.email,
        `Reminder: your POS check is due by ${formatLongDate(deadline)} - ${t.siteName}`,
        emailShell(
          "POS Check Reminder",
          `<p>Hi ${firstName},</p>
           <p>Just a reminder that your monthly POS check for <strong>${t.siteName}</strong> must be submitted by <strong>${formatLongDate(deadline)}</strong>.</p>
           <p>It takes about 10 minutes. A late check brings down your showroom's compliance score.</p>
           ${button}
           <p style="color:${BRAND.grey}; font-size:13px;">Already done it? Thank you - you can ignore this email.</p>`
        )
      );
    } else {
      await sendEmail(
        t.email,
        `Overdue: your ${periodLabel(due.period)} POS check - ${t.siteName}`,
        emailShell(
          "POS Check Overdue",
          `<p>Hi ${firstName},</p>
           <p>We haven't received the ${periodLabel(due.period)} POS check for <strong>${t.siteName}</strong>. It was due on ${formatLongDate(deadline)}.</p>
           <p>Please complete it as soon as possible. A late check brings down your compliance score and your regional manager will review it with you.</p>
           ${button}
           <p style="color:${BRAND.grey}; font-size:13px;">If you think you've already submitted it, please let the Marketing team know.</p>`
        )
      );
    }
    result.sent.push(t.siteName);
  }
  return result;
}
