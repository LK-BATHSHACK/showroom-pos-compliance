import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseAuditExcel, isAuditTemplate, isMultiTabAuditTemplate, parseMultiTabAuditExcel } from "@/lib/parseAuditExcel";
import { isMsFormsExport, parseMsFormsExcel } from "@/lib/parseMsFormsExcel";
import { isSpotCheckWorkbook, parseSpotCheckExcel } from "@/lib/parseSpotCheckExcel";
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

    // Live formats as of 14 Aug 2026 - detected by workbook shape, not
    // filename:
    //  1. Audit Intake Template (single sheet named "Audit") - any one
    //     showroom, for an ad-hoc one-off audit.
    //  2. Audit Intake Template, multi-tab round variant - one tab per
    //     Group A showroom, so Jordan can fill in one file for his whole
    //     day's round instead of a separate file per store.
    //  3. Microsoft Forms export - every showroom's monthly self-report.
    //  4. "Showrooms POS Spot Check" workbook (NI/ROI regional tracker,
    //     lib/parseSpotCheckExcel.ts) - Jordan's actual working file for
    //     his in-person Group A/B rounds (confirmed 14 Aug 2026 - this is
    //     NOT the retired format, it's what he really uses month to
    //     month; an earlier assumption that he'd switched to the Audit
    //     Intake Template instead was wrong, so this format was
    //     re-enabled rather than left rejected).
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    let parsedAudits: ParsedAudit[];
    let format: string;
    // Parse-time failures (e.g. a tab in a multi-tab round file that's
    // missing a required field) - reported alongside processing failures
    // rather than aborting the whole upload over one bad tab.
    let parseErrors: { showroom: string; error: string }[] = [];
    if (isAuditTemplate(wb)) {
      parsedAudits = [parseAuditExcel(buffer)];
      format = "Audit Intake Template";
    } else if (isMultiTabAuditTemplate(wb)) {
      const parsed = parseMultiTabAuditExcel(buffer);
      parsedAudits = parsed.audits;
      parseErrors = parsed.errors.map((e) => ({ showroom: e.sheet, error: e.error }));
      format = "Audit Intake Template (multi-showroom round)";
    } else if (isMsFormsExport(wb)) {
      parsedAudits = parseMsFormsExcel(buffer);
      format = "Microsoft Forms export (Monthly self-report)";
    } else if (isSpotCheckWorkbook(wb)) {
      parsedAudits = parseSpotCheckExcel(buffer);
      format = "Showrooms POS Spot Check (NI/ROI tracker)";
    } else {
      return NextResponse.json(
        {
          error:
            'Unrecognised file. This needs to be the "Audit Intake Template.xlsx" (single showroom or multi-tab round), the "Showrooms POS Spot Check" NI/ROI tracker, or a Microsoft Forms export (every showroom\'s monthly self-report).',
        },
        { status: 400 }
      );
    }

    if (parsedAudits.length === 0 && parseErrors.length === 0) {
      return NextResponse.json({ error: "No showroom data found to import in this file. If this is a multi-tab round file, every tab was left blank." }, { status: 400 });
    }
    if (parsedAudits.length === 0 && parseErrors.length > 0) {
      return NextResponse.json(
        { error: `Every filled-in tab had a problem: ${parseErrors.map((e) => `${e.showroom} (${e.error})`).join("; ")}` },
        { status: 400 }
      );
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
    // Combines Airtable-write failures (from processAuditSubmission) with
    // parse-time failures (a bad tab in a multi-tab round file) so both
    // show up together in the summary email and JSON response.
    const allErrors = [...parseErrors, ...failed.map((r) => ({ showroom: r.showroomName, error: r.error }))];

    // One consolidated summary email per upload, not one per showroom -
    // a Group A region file can cover 8+ showrooms at once.
    const notifyEmail = process.env.MARKETING_NOTIFY_EMAIL;
    if (notifyEmail && (ok.length || allErrors.length)) {
      const ragColor: Record<string, string> = { Green: "#0ca30c", Amber: "#fab219", Red: "#d03b3b" };
      const rows = ok
        .map(
          (r) =>
            `<tr><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.showroomName}</td><td style="padding:4px 8px; border-bottom:1px solid #eee; color:${ragColor[r.rag]}; font-weight:bold;">${r.rag}</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.score}/100</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.actionsCreated}</td><td style="padding:4px 8px; border-bottom:1px solid #eee;">${r.actionsVerified}</td></tr>`
        )
        .join("");
      const errorRows = allErrors
        .map((r) => `<tr><td style="padding:4px 8px; color:#d03b3b;" colspan="4">${r.showroom}: ${r.error}</td></tr>`)
        .join("");
      await sendEmail(
        notifyEmail,
        `Audit${ok.length === 1 ? "" : "s"} submitted (${format}): ${ok.length} showroom${ok.length === 1 ? "" : "s"}${allErrors.length ? `, ${allErrors.length} error${allErrors.length === 1 ? "" : "s"}` : ""}`,
        emailShell(
          "New Audit(s) Submitted",
          `<p><strong>Source:</strong> ${format}</p>
           <table style="width:100%; border-collapse:collapse; font-size:14px;">
             <thead><tr style="text-align:left; color:#6E6E6E;"><th style="padding:4px 8px;">Showroom</th><th style="padding:4px 8px;">RAG</th><th style="padding:4px 8px;">Score</th><th style="padding:4px 8px;">Actions created</th><th style="padding:4px 8px;">Actions verified fixed</th></tr></thead>
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
      results: ok.map((r) => ({ showroom: r.showroomName, score: r.score, rag: r.rag, actionsCreated: r.actionsCreated, actionsVerified: r.actionsVerified, breakdown: r.breakdown })),
      errors: allErrors,
      newIdeasLogged,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error processing the audit." }, { status: 500 });
  }
}
