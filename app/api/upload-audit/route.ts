import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseAuditExcel, isAuditTemplate } from "@/lib/parseAuditExcel";
import { isMsFormsExport, parseMsFormsExcel } from "@/lib/parseMsFormsExcel";
import { isSpotCheckWorkbook } from "@/lib/parseSpotCheckExcel";
import { ParsedAudit } from "@/lib/parsedAudit";
import { loadSharedContext, processAuditSubmission, ProcessedAuditResult } from "@/lib/processAuditSubmission";
import { createRecords, TABLES } from "@/lib/airtable";
import { sendEmail, emailShell } from "@/lib/resend";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as unknown as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Two live formats as of the 14 Aug 2026 process change - every
    // showroom self-reports monthly via the Microsoft Form, and Jordan's
    // visits are spot checks recorded on the same single-showroom Audit
    // Intake Template everyone else effectively uses, rather than a full
    // audit. Detected by workbook shape, not filename.
    //
    // The multi-showroom "Spot Check workbook" (lib/parseSpotCheckExcel.ts)
    // is retired from this live path but not deleted - it's still
    // detectable so an old copy gets a clear message instead of a
    // confusing failure, and it's one import away from being reinstated
    // if the process changes again.
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    let parsedAudits: ParsedAudit[];
    let format: string;
    if (isAuditTemplate(wb)) {
      parsedAudits = [parseAuditExcel(buffer)];
      format = "Audit Intake Template";
    } else if (isMsFormsExport(wb)) {
      parsedAudits = parseMsFormsExcel(buffer);
      format = "Microsoft Forms export (Monthly self-report)";
    } else if (isSpotCheckWorkbook(wb)) {
      return NextResponse.json(
        {
          error:
            'The multi-showroom Spot Check workbook is no longer used - since 14 Aug 2026, Jordan\'s in-person visits use the "Audit Intake Template.xlsx" instead (one per showroom visited).',
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        {
          error:
            'Unrecognised file. This needs to be either the "Audit Intake Template.xlsx" (single showroom - used for Jordan\'s in-person spot checks) or a Microsoft Forms export (every showroom\'s monthly self-report).',
        },
        { status: 400 }
      );
    }

    if (parsedAudits.length === 0) {
      return NextResponse.json({ error: "No showroom data found to import in this file." }, { status: 400 });
    }

    const ctx = await loadSharedContext();
    const results: ProcessedAuditResult[] = [];
    for (const parsed of parsedAudits) {
      results.push(await processAuditSubmission(parsed, ctx));
    }

    // Any "not on this list" / "other support" free text that came with a
    // Microsoft Forms response becomes a POS Request, same as if it had
    // been typed into the app's own Submit New Idea form - so it lands in
    // your existing approve/decline review flow rather than getting lost.
    let newIdeasLogged = 0;
    for (const parsed of parsedAudits) {
      if (!parsed.newIdeaText) continue;
      const showroom = ctx.showroomsByNormalizedName.get(parsed.showroomName.toLowerCase().trim());
      await createRecords(TABLES.POS_REQUESTS, [
        {
          Showroom: showroom ? [showroom.id] : [],
          RequesterName: parsed.completedByName || "",
          RequesterEmail: parsed.completedByEmail || "",
          RequestDate: parsed.auditDate || new Date().toISOString().slice(0, 10),
          IdeaDescription: parsed.newIdeaText,
          BusinessReason: "",
          CustomerProblemOpportunity: "",
          SuggestedLocation: "",
          ProductCategory: "",
          Urgency: "Medium",
          OtherShowroomsMayBenefit: false,
          Status: "Submitted",
        },
      ]);
      newIdeasLogged++;
    }

    const ok = results.filter((r): r is Extract<ProcessedAuditResult, { ok: true }> => r.ok);
    const failed = results.filter((r): r is Extract<ProcessedAuditResult, { ok: false }> => !r.ok);

    // One consolidated summary email per upload, not one per showroom -
    // a Group A region file can cover 8+ showrooms at once.
    const notifyEmail = process.env.MARKETING_NOTIFY_EMAIL;
    if (notifyEmail && (ok.length || failed.length)) {
      const ragColor: Record<string, string> = { Green: "#0ca30c", Amber: "#fab219", Red: "#d03b3b" };
      const rows = ok
        .map(
          (r) =>
            `<tr><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.showroomName}</td><td style="padding:4px 8px; border-bottom:1px solid #eee; color:${ragColor[r.rag]}; font-weight:bold;">${r.rag}</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.score}/100</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.actionsCreated}</td></tr>`
        )
        .join("");
      const errorRows = failed
        .map((r) => `<tr><td style="padding:4px 8px; color:#d03b3b;" colspan="4">${r.showroomName}: ${r.error}</td></tr>`)
        .join("");
      await sendEmail(
        notifyEmail,
        `Audit${ok.length === 1 ? "" : "s"} submitted (${format}): ${ok.length} showroom${ok.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} error${failed.length === 1 ? "" : "s"}` : ""}`,
        emailShell(
          "New Audit(s) Submitted",
          `<p><strong>Source:</strong> ${format}</p>
           <table style="width:100%; border-collapse:collapse; font-size:14px;">
             <thead><tr style="text-align:left; color:#6E6E6E;"><th style="padding:4px 8px;">Showroom</th><th style="padding:4px 8px;">RAG</th><th style="padding:4px 8px;">Score</th><th style="padding:4px 8px;">Actions created</th></tr></thead>
             <tbody>${rows}${errorRows}</tbody>
           </table>
           ${newIdeasLogged ? `<p>${newIdeasLogged} new POS idea${newIdeasLogged === 1 ? "" : "s"} logged for review in POS Requests.</p>` : ""}`
        )
      );
    }

    // Same consolidation for the designer email - one email listing
    // everything flagged across the whole batch.
    const designerEmail = process.env.DESIGNER_NOTIFY_EMAIL;
    const allFlagged: Array<Record<string, any> & { _showroom: string }> = ok.flatMap((r) =>
      r.actionsToCreate.map((a) => ({ ...a, _showroom: r.showroomName }))
    );
    if (designerEmail && allFlagged.length) {
      const rows = allFlagged
        .map(
          (a) =>
            `<tr><td style="padding:4px 8px; border-bottom:1px solid #eee;">${a._showroom}</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${a.IssueDescription}</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${a.Priority}</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${a.TargetCompletionDate}</td></tr>`
        )
        .join("");
      await sendEmail(
        designerEmail,
        `POS needs organising: ${ok.length} showroom${ok.length === 1 ? "" : "s"} (${allFlagged.length} item${allFlagged.length === 1 ? "" : "s"})`,
        emailShell(
          "POS Flagged - Action Needed",
          `<p>The latest review (${format}) flagged the following POS as missing, damaged, or otherwise needing attention:</p>
           <table style="width:100%; border-collapse:collapse; font-size:14px;">
             <thead><tr style="text-align:left; color:#6E6E6E;"><th style="padding:4px 8px;">Showroom</th><th style="padding:4px 8px;">Item / issue</th><th style="padding:4px 8px;">Priority</th><th style="padding:4px 8px;">Target date</th></tr></thead>
             <tbody>${rows}</tbody>
           </table>
           <p>Full details and photos are in the Actions Tracker in the app.</p>`
        )
      );
    }

    return NextResponse.json({
      success: true,
      format,
      results: ok.map((r) => ({ showroom: r.showroomName, score: r.score, rag: r.rag, actionsCreated: r.actionsCreated, breakdown: r.breakdown })),
      errors: failed.map((r) => ({ showroom: r.showroomName, error: r.error })),
      newIdeasLogged,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error processing the audit." }, { status: 500 });
  }
}
