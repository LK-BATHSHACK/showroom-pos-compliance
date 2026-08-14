import { listRecords, createRecords, updateRecords, AirtableRecord, TABLES } from "./airtable";
import { computeAuditScore, ragFromScore, actionPriority, ScoredLineItem, CatalogueInfo, ScoreBreakdown } from "./scoring";
import { Settings, slaForPriority } from "./settings";
import { ParsedAudit } from "./parsedAudit";

function esc(s: string) {
  return s.replace(/"/g, '\\"');
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ProcessedAuditResult =
  | {
      ok: true;
      showroomName: string;
      sourceLabel?: string;
      score: number;
      rag: "Green" | "Amber" | "Red";
      actionsCreated: number;
      actionsToCreate: Record<string, any>[];
      breakdown: ScoreBreakdown;
    }
  | { ok: false; showroomName: string; sourceLabel?: string; error: string };

export type SharedContext = {
  showroomsByNormalizedName: Map<string, AirtableRecord<{ ShowroomName: string; AuditGroup: string }>>;
  catalogueByName: Record<string, CatalogueInfo>;
  catalogueIdByName: Record<string, string>;
  settings: Settings;
};

export async function loadSharedContext(): Promise<SharedContext> {
  const { getSettings } = await import("./settings");
  const [showroomRecords, catalogueRecords, settings] = await Promise.all([
    listRecords<{ ShowroomName: string; AuditGroup: string }>(TABLES.SHOWROOMS),
    listRecords<{ POSName: string; RequiredOptional: CatalogueInfo["RequiredOptional"]; Weight: number; Campaign?: string; Status?: string }>(
      TABLES.POS_CATALOGUE
    ),
    getSettings(),
  ]);

  const showroomsByNormalizedName = new Map<string, AirtableRecord<any>>();
  showroomRecords.forEach((s) => showroomsByNormalizedName.set(s.fields.ShowroomName.toLowerCase().trim(), s));

  const catalogueByName: Record<string, CatalogueInfo> = {};
  const catalogueIdByName: Record<string, string> = {};
  catalogueRecords.forEach((r) => {
    catalogueByName[r.fields.POSName] = {
      RequiredOptional: r.fields.RequiredOptional,
      Weight: Number(r.fields.Weight) || 1,
      Campaign: r.fields.Campaign,
      Status: r.fields.Status,
    };
    catalogueIdByName[r.fields.POSName] = r.id;
  });

  return { showroomsByNormalizedName, catalogueByName, catalogueIdByName, settings };
}

/** Does all the Airtable writes (Audit, Audit Line Items, Actions, Showroom
 * update) for one showroom's parsed audit. Does NOT send any emails - the
 * caller batches those once per upload rather than once per showroom, since
 * a single file can cover many showrooms (Group A spot check) or many
 * responses (Group B Microsoft Form export). */
export async function processAuditSubmission(parsed: ParsedAudit, ctx: SharedContext): Promise<ProcessedAuditResult> {
  const showroom = ctx.showroomsByNormalizedName.get(parsed.showroomName.toLowerCase().trim());
  if (!showroom) {
    return {
      ok: false,
      showroomName: parsed.showroomName,
      sourceLabel: parsed.sourceLabel,
      error: `Showroom "${parsed.showroomName}" wasn't found in Airtable. Check spelling / that it's active.`,
    };
  }

  const auditDate = parsed.auditDate || new Date().toISOString().slice(0, 10);

  const priorActions = await listRecords<{ Status: string; DateIdentified: string }>(TABLES.ACTIONS, {
    filterByFormula: `AND(SEARCH("${esc(showroom.fields.ShowroomName)}", ARRAYJOIN({Showroom})) > 0, IS_BEFORE({DateIdentified}, "${auditDate}"))`,
  });
  const priorOpenCount = priorActions.length;
  const resolvedNowCount = priorActions.filter((a) => a.fields.Status === "Verified-Closed").length;

  const scoredItems: ScoredLineItem[] = parsed.lineItems.map((li) => ({
    posName: li.posName,
    conditionStatus: li.conditionStatus as any,
    hasPhoto: !!li.hasPhoto,
  }));

  const score = computeAuditScore(scoredItems, ctx.catalogueByName, { priorOpenCount, resolvedNowCount });
  const rag = ragFromScore(score.finalScore, ctx.settings.GreenThreshold, ctx.settings.AmberThreshold);

  // Every showroom now self-reports monthly via the same Microsoft Form
  // (14 Aug 2026 process change) - that parser always sets its own
  // auditType explicitly, so this fallback really only fires for the Audit
  // Intake Template path when Jordan leaves the dropdown blank on one of
  // his in-person spot checks.
  const defaultAuditType = "Physical (Group A)";

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
    POSItem: ctx.catalogueIdByName[li.posName] ? [ctx.catalogueIdByName[li.posName]] : [],
    ConditionStatus: li.conditionStatus,
    Comments: li.comments,
    ActionRequired: li.conditionStatus !== "Present-OK",
  }));
  const createdLineItems = parsed.lineItems.length ? await createRecords(TABLES.AUDIT_LINE_ITEMS, lineItemFields) : [];

  const actionsToCreate: Record<string, any>[] = [];
  parsed.lineItems.forEach((li, idx) => {
    if (li.conditionStatus === "Present-OK") return;
    const cat = ctx.catalogueByName[li.posName];
    const priority = actionPriority(li.conditionStatus as any, cat?.RequiredOptional || "Optional");
    const slaDays = slaForPriority(ctx.settings, priority);
    actionsToCreate.push({
      Showroom: [showroom.id],
      SourceAuditLineItem: [createdLineItems[idx].id],
      IssueDescription: `${li.posName}: ${li.conditionStatus}${li.comments ? " - " + li.comments : ""}`,
      POSItem: ctx.catalogueIdByName[li.posName] ? [ctx.catalogueIdByName[li.posName]] : [],
      Priority: priority,
      OwnerName: "Marketing",
      OwnerEmail: process.env.MARKETING_NOTIFY_EMAIL || "",
      DateIdentified: auditDate,
      TargetCompletionDate: addDays(auditDate, slaDays),
      Status: "Open",
    });
  });
  const createdActions = actionsToCreate.length ? await createRecords(TABLES.ACTIONS, actionsToCreate) : [];

  // Uniform monthly cadence for every showroom (14 Aug 2026 process change -
  // previously 28 days for Group A / 90 for Group B).
  const cadenceDays = 30;
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

  return {
    ok: true,
    showroomName: showroom.fields.ShowroomName,
    sourceLabel: parsed.sourceLabel,
    score: score.finalScore,
    rag,
    actionsCreated: createdActions.length,
    actionsToCreate,
    breakdown: score,
  };
}
