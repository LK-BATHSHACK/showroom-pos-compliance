import { NextRequest, NextResponse } from "next/server";
import { listRecords, TABLES } from "@/lib/airtable";
import { sendEmail, emailShell, BRAND } from "@/lib/resend";

export const runtime = "nodejs";

// Runs on the 1st of each month via Vercel Cron (see vercel.json) - a
// month-start snapshot of the whole estate for the Head of Marketing,
// separate from the per-audit "an audit was just submitted" email in
// upload-audit/route.ts. Same CRON_SECRET check as the daily reminders job
// per Gate 1: headless endpoints must reject calls without the right
// credential.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifyEmail = process.env.MARKETING_NOTIFY_EMAIL;
  if (!notifyEmail) {
    return NextResponse.json({ error: "MARKETING_NOTIFY_EMAIL is not set" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [showroomRecords, actionRecords] = await Promise.all([
    listRecords<any>(TABLES.SHOWROOMS),
    listRecords<any>(TABLES.ACTIONS),
  ]);

  const showrooms = showroomRecords.filter((r) => r.fields.Active !== false);
  const scored = showrooms.filter((s) => typeof s.fields.ComplianceScore === "number");
  const avgScore = scored.length
    ? Math.round((scored.reduce((sum, s) => sum + (s.fields.ComplianceScore || 0), 0) / scored.length) * 10) / 10
    : null;

  const ragColor: Record<string, string> = { Green: "#0ca30c", Amber: "#fab219", Red: "#d03b3b" };
  const ragCounts = { Green: 0, Amber: 0, Red: 0, "No data": 0 };
  showrooms.forEach((s) => {
    const rag = s.fields.RAGStatus as keyof typeof ragCounts;
    if (rag && ragCounts[rag] !== undefined) ragCounts[rag]++;
    else ragCounts["No data"]++;
  });

  const overdue = showrooms.filter((s) => s.fields.NextAuditDue && s.fields.NextAuditDue < today);

  const openActions = actionRecords.filter((a: any) => a.fields.Status === "Open" || a.fields.Status === "In progress");
  const priorityOrder = ["Critical", "High", "Medium", "Low"];
  const openByPriority: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  openActions.forEach((a: any) => {
    if (a.fields.Priority in openByPriority) openByPriority[a.fields.Priority]++;
  });

  const showroomRows = showrooms
    .slice()
    .sort((a, b) => (a.fields.ComplianceScore ?? -1) - (b.fields.ComplianceScore ?? -1))
    .map((s) => {
      const rag = s.fields.RAGStatus || "No data";
      const isOverdue = s.fields.NextAuditDue && s.fields.NextAuditDue < today;
      return `<tr>
        <td style="padding:4px 8px; border-bottom:1px solid #eee;">${s.fields.ShowroomName}</td>
        <td style="padding:4px 8px; border-bottom:1px solid #eee; color:${ragColor[rag] || "#6E6E6E"}; font-weight:bold;">${rag}</td>
        <td style="padding:4px 8px; border-bottom:1px solid #eee;">${s.fields.ComplianceScore ?? "-"}</td>
        <td style="padding:4px 8px; border-bottom:1px solid #eee; ${isOverdue ? "color:#d03b3b; font-weight:bold;" : ""}">${s.fields.NextAuditDue || "-"}${isOverdue ? " (overdue)" : ""}</td>
      </tr>`;
    })
    .join("");

  const html = emailShell(
    "Monthly POS Compliance Summary",
    `<p>Estate snapshot as of ${today}.</p>
     <table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px;">
       <tr><td style="padding:4px 8px; color:#6E6E6E;">Estate avg. compliance score</td><td style="padding:4px 8px; font-weight:bold;">${avgScore ?? "-"}</td></tr>
       <tr><td style="padding:4px 8px; color:#6E6E6E;">Fully compliant (Green)</td><td style="padding:4px 8px; font-weight:bold; color:${ragColor.Green};">${ragCounts.Green} of ${showrooms.length}</td></tr>
       <tr><td style="padding:4px 8px; color:#6E6E6E;">Needs attention (Amber/Red)</td><td style="padding:4px 8px; font-weight:bold; color:${ragColor.Red};">${ragCounts.Amber + ragCounts.Red} (${ragCounts.Red} Red)</td></tr>
       <tr><td style="padding:4px 8px; color:#6E6E6E;">Overdue for audit</td><td style="padding:4px 8px; font-weight:bold;">${overdue.length}</td></tr>
       <tr><td style="padding:4px 8px; color:#6E6E6E;">Open actions (Critical/High/Medium/Low)</td><td style="padding:4px 8px; font-weight:bold;">${openByPriority.Critical} / ${openByPriority.High} / ${openByPriority.Medium} / ${openByPriority.Low}</td></tr>
     </table>
     <table style="width:100%; border-collapse:collapse; font-size:14px;">
       <thead><tr style="text-align:left; color:#6E6E6E;"><th style="padding:4px 8px;">Showroom</th><th style="padding:4px 8px;">RAG</th><th style="padding:4px 8px;">Score</th><th style="padding:4px 8px;">Next due</th></tr></thead>
       <tbody>${showroomRows}</tbody>
     </table>
     <p style="margin-top:20px;"><a href="https://${req.headers.get("host")}/dashboard" style="color:${BRAND.pink};">Open the full dashboard</a></p>`
  );

  await sendEmail(notifyEmail, `Monthly POS Compliance Summary - ${today.slice(0, 7)}`, html);

  return NextResponse.json({ success: true, showrooms: showrooms.length, avgScore, overdue: overdue.length });
}
