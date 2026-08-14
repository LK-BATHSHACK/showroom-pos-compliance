import { NextRequest, NextResponse } from "next/server";
import { parseAuditExcel } from "@/lib/parseAuditExcel";
import { listRecords, createRecords, updateRecords, TABLES } from "@/lib/airtable";
import { computeAuditScore, ragFromScore, actionPriority, ScoredLineItem, CatalogueInfo } from "@/lib/scoring";
import { getSettings, slaForPriority } from "@/lib/settings";
import { sendEmail, emailShell } from "@/lib/resend";

export const runtime = "nodejs";

function esc(s: string) {
  return s.replace(/"/g, '\\"');
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as unknown as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseAuditExcel(buffer);
    const auditDate = parsed.auditDate || new Date().toISOString().slice(0, 10);

    const showrooms = await listRecords<{ ShowroomName: string; AuditGroup: string }>(TABLES.SHOWROOMS);
    const showroom = showrooms.find((s) => s.fields.ShowroomName === parsed.showroomName);
    if (!showroom) {
      return NextResponse.json(
        { error: `Showroom "${parsed.showroomName}" wasn't found in Airtable. Check spelling / that it's active.` },
        { status: 400 }
      );
    }

    const catalogueRecords = await listRecords<{
      POSName: string; RequiredOptional: CatalogueInfo["RequiredOptional"]; Weight: number; Campaign?: string; Status?: string;
    }>(TABLES.POS_CATALOGUE);
    const catalogueByName: Record<string, CatalogueInfo> = {};
    const catalogueIdByName: Record<string, string> = {};
    for (const r of catalogueRecords) {
      catalogueByName[r.fields.POSName] = {
        RequiredOptional: r.fields.RequiredOptional,
        Weight: Number(r.fields.Weight) || 1,
        Campaign: r.fields.Campaign,
        Status: r.fields.Status,
      };
      catalogueIdByName[r.fields.POSName] = r.id;
    }

    const settings = await getSettings();

    // "Resolution of previous actions" component: actions raised for this
    // showroom before this audit's date, and how many of those are now
    // Verified-Closed. See lib/scoring.ts for the caveat on this being a
    // proxy rather than a true "did you fix what we flagged last time" check.
    const priorActions = await listRecords<{ Status: string; DateIdentified: string }>(TABLES.ACTIONS, {
      filterByFormula: `AND(SEARCH("${esc(parsed.showroomName)}", ARRAYJOIN({Showroom})) > 0, IS_BEFORE({DateIdentified}, "${auditDate}"))`,
    });
    const priorOpenCount = priorActions.length;
    const resolvedNowCount = priorActions.filter((a) => a.fields.Status === "Verified-Closed").length;

    const scoredItems: ScoredLineItem[] = parsed.lineItems.map((li) => ({
      posName: li.posName,
      conditionStatus: li.conditionStatus as any,
      hasPhoto: false, // photo capture happens in a follow-up step, not yet wired to this upload path
    }));

    const score = computeAuditScore(scoredItems, catalogueByName, { priorOpenCount, resolvedNowCount });
    const rag = ragFromScore(score.finalScore, settings.GreenThreshold, settings.AmberThreshold);

    const defaultAuditType = showroom.fields.AuditGroup === "Group A" ? "Physical (Group A)" : "Remote (Group B)";

    const [auditRecord] = await createRecords(TABLES.AUDITS, [
      {
        Showroom: [showroom.id],
        AuditType: parsed.auditType || defaultAuditType,
        AuditDate: auditDate,
        CompletedByName: parsed.completedByName,
        CompletedByEmail: parsed.completedByEmail,
        OverallComplianceScore: score.finalScore,
        RAGStatus: rag,
        GeneralComments: parsed.generalComments,
        SupportRequiredFromMarketing: parsed.supportRequired,
        SupportRequiredDetails: parsed.supportDetails,
        Status: "Submitted",
      },
    ]);

    const lineItemFields = parsed.lineItems.map((li) => ({
      Audit: [auditRecord.id],
      POSItem: catalogueIdByName[li.posName] ? [catalogueIdByName[li.posName]] : [],
      ConditionStatus: li.conditionStatus,
      Comments: li.comments,
      ActionRequired: li.conditionStatus !== "Present-OK",
    }));
    const createdLineItems = await createRecords(TABLES.AUDIT_LINE_ITEMS, lineItemFields);

    const actionsToCreate: Record<string, any>[] = [];
    parsed.lineItems.forEach((li, idx) => {
      if (li.conditionStatus === "Present-OK") return;
      const cat = catalogueByName[li.posName];
      const priority = actionPriority(li.conditionStatus as any, cat?.RequiredOptional || "Optional");
      const slaDays = slaForPriority(settings, priority);
      actionsToCreate.push({
        Showroom: [showroom.id],
        SourceAuditLineItem: [createdLineItems[idx].id],
        IssueDescription: `${li.posName}: ${li.conditionStatus}${li.comments ? " - " + li.comments : ""}`,
        POSItem: catalogueIdByName[li.posName] ? [catalogueIdByName[li.posName]] : [],
        Priority: priority,
        OwnerName: "Marketing",
        OwnerEmail: process.env.MARKETING_NOTIFY_EMAIL || "",
        DateIdentified: auditDate,
        TargetCompletionDate: addDays(auditDate, slaDays),
        Status: "Open",
      });
    });
    const createdActions = actionsToCreate.length ? await createRecords(TABLES.ACTIONS, actionsToCreate) : [];

    const cadenceDays = showroom.fields.AuditGroup === "Group A" ? 28 : 90;
    await updateRecords(TABLES.SHOWROOMS, [
      {
        id: showroom.id,
        fields: {
          LastAuditDate: auditDate,
          NextAuditDue: addDays(auditDate, cadenceDays),
          ComplianceScore: score.finalScore,
          RAGStatus: rag,
        },
      },
    ]);

    const notifyEmail = process.env.MARKETING_NOTIFY_EMAIL;
    if (notifyEmail) {
      const ragColor = rag === "Green" ? "#0ca30c" : rag === "Amber" ? "#fab219" : "#d03b3b";
      await sendEmail(
        notifyEmail,
        `Audit submitted: ${parsed.showroomName} - ${rag} (${score.finalScore}/100)`,
        emailShell(
          "New Audit Submitted",
          `<p><strong>Showroom:</strong> ${parsed.showroomName}<br/>
           <strong>Completed by:</strong> ${parsed.completedByName || "-"}<br/>
           <strong>Score:</strong> ${score.finalScore}/100 &nbsp; <span style="color:${ragColor}; font-weight:bold;">${rag}</span><br/>
           <strong>Actions created:</strong> ${createdActions.length}</p>
           ${parsed.supportRequired ? `<p style="background:#FFF6FA; border-left:4px solid #E6017E; padding:8px 12px;"><strong>Support requested:</strong> ${parsed.supportDetails || "(no details given)"}</p>` : ""}`
        )
      );
    }

    return NextResponse.json({
      success: true,
      showroom: parsed.showroomName,
      score: score.finalScore,
      rag,
      actionsCreated: createdActions.length,
      breakdown: score,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message || "Unexpected error processing the audit." }, { status: 500 });
  }
}
