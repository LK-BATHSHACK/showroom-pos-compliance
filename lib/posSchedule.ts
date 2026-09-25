// The monthly POS check schedule, in one place (25 Sep 2026).
//
// Rule (Lorraine): every showroom's POS check must be submitted by the 28th
// of each month. Used by:
//   - lib/posReminders.ts (reminder + overdue emails)
//   - lib/processAuditSubmission.ts (Showrooms.NextAuditDue, the "Next due"
//     shown on the dashboard and showroom pages)
//
// Pure date helpers only - no Airtable/Resend imports - so anything can use
// them. All dates are YYYY-MM-DD strings on the UK calendar.

/** Day of the month the POS check must be submitted by. */
export const POS_MONTHLY_DUE_DAY = 28;
/** Days before the due day the reminder goes out (the 25th). */
export const POS_REMINDER_LEAD_DAYS = 3;
/** December's reminder goes a week early, on the 18th (Lorraine, 23 Sep 2026). */
export const POS_DECEMBER_REMINDER_LEAD_DAYS = 10;
/**
 * The 28th-of-the-month schedule starts with September 2026. Checks dated
 * before this were the old "1st working day / 5-day window" round and count
 * as the previous month's check (Lorraine, 23 Sep 2026: the 1-7 Sep checks
 * are August's).
 */
export const POS_SCHEDULE_START = "2026-09-08";

/** AuditType of Jordan's in-person spot checks - these don't count as the store's own monthly check. */
export const SPOT_CHECK_AUDIT_TYPE = "Physical (Group A)";

/** Today's date in Europe/London, as YYYY-MM-DD - so a 7am UTC cron never lands on "yesterday" or "tomorrow". */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function ymd(y: number, m: number, d: number): string {
  // Date.UTC handles overflow (e.g. month 13 -> January next year).
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sunday
}

export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return ymd(y, m - 1, 1).slice(0, 7);
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return ymd(y, m + 1, 1).slice(0, 7);
}

/** The 28th of a period (YYYY-MM). */
export function dueDateFor(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return ymd(y, m, POS_MONTHLY_DUE_DAY);
}

/** Reminder date for a period: the 25th (18th in December), moved to Saturday if it's a Sunday. */
export function reminderDateFor(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const lead = m === 12 ? POS_DECEMBER_REMINDER_LEAD_DAYS : POS_REMINDER_LEAD_DAYS;
  const d = ymd(y, m, POS_MONTHLY_DUE_DAY - lead);
  return dayOfWeek(d) === 0 ? addDays(d, -1) : d;
}

/** Overdue date for a period: the day after the 28th, moved to Monday if it's a Sunday (it can't go earlier - it isn't overdue yet). */
export function overdueDateFor(period: string): string {
  const d = addDays(dueDateFor(period), 1);
  return dayOfWeek(d) === 0 ? addDays(d, 1) : d;
}

/** Which month's check an audit dated `auditDate` counts as (YYYY-MM). */
export function periodForAuditDate(auditDate: string): string {
  const period = auditDate.slice(0, 7);
  return auditDate < POS_SCHEDULE_START ? prevPeriod(period) : period;
}

/** After a store submits its check dated `auditDate`, its next check is due on the 28th of the following month. */
export function nextDueAfterSubmission(auditDate: string): string {
  return dueDateFor(nextPeriod(periodForAuditDate(auditDate)));
}
