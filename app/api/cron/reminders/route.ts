import { NextRequest, NextResponse } from "next/server";
import { listRecords, TABLES } from "@/lib/airtable";
import { getSettings } from "@/lib/settings";
import { sendEmail, emailShell } from "@/lib/resend";

export const runtime = "nodejs";

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

// Runs daily via Vercel Cron (see vercel.json). Vercel signs cron requests
// itself, but we also require CRON_SECRET as a belt-and-braces check per
// Gate 1's rule that headless endpoints must reject calls without the right
// credential, not just trust that only Vercel could be calling them.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const settings = await getSettings();
  const showrooms = await listRecords<any>(TABLES.SHOWROOMS);
  const actions = await listRecords<any>(TABLES.ACTIONS);

  let auditReminders = 0;
  let auditEscalations = 0;
  let actionEscalations = 0;

  for (const s of showrooms) {
    if (s.fields.Active === false || !s.fields.NextAuditDue) continue;
    const daysUntilDue = daysBetween(s.fields.NextAuditDue, today);

    // Upcoming reminder, fires once on the exact lead-day boundary.
    if (daysUntilDue === settings.GroupB_ReminderLeadDays && s.fields.ShowroomManagerEmail) {
      await sendEmail(
        s.fields.ShowroomManagerEmail,
        `Reminder: POS audit due soon - ${s.fields.ShowroomName}`,
        emailShell("Audit Reminder", `<p>The next POS audit for <strong>${s.fields.ShowroomName}</strong> is due on <strong>${s.fields.NextAuditDue}</strong>. Please complete the Audit Intake Template and upload it before then.</p>`)
      );
      auditReminders++;
    }

    // Overdue escalation, fires once on each exact escalation-day boundary.
    const daysOverdue = -daysUntilDue;
    if (daysOverdue === settings.Escalation_ToRegionalManager_Days && s.fields.RegionalManagerEmail) {
      await sendEmail(
        [s.fields.ShowroomManagerEmail, s.fields.RegionalManagerEmail].filter(Boolean),
        `Overdue: POS audit - ${s.fields.ShowroomName}`,
        emailShell("Audit Overdue", `<p><strong>${s.fields.ShowroomName}</strong>'s POS audit is now ${daysOverdue} days overdue. Regional manager copied for visibility.</p>`)
      );
      auditEscalations++;
    }
    if (daysOverdue === settings.Escalation_ToMarketing_Days && process.env.MARKETING_NOTIFY_EMAIL) {
      await sendEmail(
        [s.fields.ShowroomManagerEmail, s.fields.RegionalManagerEmail, process.env.MARKETING_NOTIFY_EMAIL].filter(Boolean),
        `Escalation: POS audit significantly overdue - ${s.fields.ShowroomName}`,
        emailShell("Audit Overdue - Marketing Escalation", `<p><strong>${s.fields.ShowroomName}</strong>'s POS audit is now ${daysOverdue} days overdue. Marketing copied.</p>`)
      );
    }
  }

  for (const a of actions) {
    if (a.fields.Status === "Resolved" || a.fields.Status === "Verified-Closed") continue;
    if (!a.fields.TargetCompletionDate) continue;
    const daysOverdue = daysBetween(today, a.fields.TargetCompletionDate) * -1;
    if (daysOverdue === 0 && a.fields.OwnerEmail) {
      // Fires once, exactly on the due date.
      await sendEmail(
        a.fields.OwnerEmail,
        `Action due today: ${a.fields.IssueDescription}`,
        emailShell("Action Due", `<p>"${a.fields.IssueDescription}" is due today. Priority: ${a.fields.Priority}.</p>`)
      );
      actionEscalations++;
    }
  }

  return NextResponse.json({ success: true, auditReminders, auditEscalations, actionEscalations });
}
