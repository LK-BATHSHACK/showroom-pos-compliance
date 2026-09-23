// Monthly POS check reminder + overdue emails for Store Managers
// (Lorraine, 23 Sep 2026: "remind them a few days before the 28th of each
// month that they must submit the POS check. Also send any store manager an
// overdue one if it goes past 28th and if the reminder email falls on a
// Sunday make sure it goes a day early so it never falls when they are off").
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

/** Day of the month the POS check must be submitted by. */
export const POS_MONTHLY_DUE_DAY = 28;
/** How many days before the due day the reminder goes out (25th). */
export const POS_REMINDER_LEAD_DAYS = 3;

const SPOT_CHECK_AUDIT_TYPE = "Physical (Group A)";

// ---- Pure date helpers (all dates are YYYY-MM-DD strings, UK calendar) ----

/** Today's date in Europe/London, as YYYY-MM-DD - so a 7am UTC cron never lands on "yesterday" or "tomorrow". */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function ymd(y: number, m: number, d: number): string {
  // Date.UTC handles overflow (e.g. 29 Feb in a non-leap year -> 1 Mar).
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
}

/** Reminder date for a period (YYYY-MM): the 25th, moved to Saturday if it's a Sunday. */
export function reminderDateFor(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = ymd(y, m, POS_MONTHLY_DUE_DAY - POS_REMINDER_LEAD_DAYS);
  return dayOfWeek(d) === 0 ? addDays(d, -1) : d;
}

/** Overdue date for a period: the day after the 28th, moved to Monday if it's a Sunday (it can't go earlier - it isn't overdue yet). */
export function overdueDateFor(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = ymd(y, m, POS_MONTHLY_DUE_DAY + 1);
  return dayOfWeek(d) === 0 ? addDays(d, 1) : d;
}

function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return ymd(y, m - 1, 1).slice(0, 7);
}

/** Which email (if any) goes out today, and for which month's deadline. */
export function whatIsDueToday(today: string): { kind: "reminder" | "overdue"; period: string } | null {
  const thisPeriod = today.slice(0, 7);
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
      .filter((a) => (a.fields.AuditDate || "").startsWith(period) && a.fields.AuditType !== SPOT_CHECK_AUDIT_TYPE)
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
  const deadline = ymd(Number(due.period.slice(0, 4)), Number(due.period.slice(5, 7)), POS_MONTHLY_DUE_DAY);
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
