// Compliance scoring, ported from Section 7 of the original solution design doc.
// A weighted 100-point score across five checkable components, plus a
// (currently inactive) "critical item override" hook - see the note on
// CRITICAL_POS_ITEM_NAMES below.

export type ConditionStatus =
  | "Present-OK"
  | "Missing"
  | "Damaged"
  | "Outdated"
  | "Incorrectly Positioned"
  | "Incorrect Branding";

export type CatalogueInfo = {
  RequiredOptional: "Mandatory" | "Optional" | "Campaign-specific";
  Weight: number;
  Campaign?: string;
  Status?: string;
};

export type ScoredLineItem = {
  posName: string;
  conditionStatus: ConditionStatus;
  hasPhoto: boolean;
};

// The design doc flags this explicitly: "the exact trigger list for the
// override should be a short, explicit set of POS items flagged Critical
// in the Master Catalogue, not a vague 'anything serious' rule" - confirm
// this list with Marketing before go-live, then fill it in here.
export const CRITICAL_POS_ITEM_NAMES: string[] = [];
export const CRITICAL_OVERRIDE_CAP = 75;

function weightedFailureDeduction(
  items: ScoredLineItem[],
  catalogue: Record<string, CatalogueInfo>,
  points: number,
  subsetFilter: (c: CatalogueInfo) => boolean,
  failureStatuses: ConditionStatus[]
): number {
  const subset = items.filter((i) => catalogue[i.posName] && subsetFilter(catalogue[i.posName]));
  if (subset.length === 0) return points; // nothing applicable, don't penalise
  const totalWeight = subset.reduce((sum, i) => sum + (catalogue[i.posName].Weight || 1), 0);
  const failWeight = subset
    .filter((i) => failureStatuses.includes(i.conditionStatus))
    .reduce((sum, i) => sum + (catalogue[i.posName].Weight || 1), 0);
  if (totalWeight === 0) return points;
  return points * (1 - failWeight / totalWeight);
}

export type ScoreBreakdown = {
  mandatoryPresence: number; // out of 40
  campaignPresence: number; // out of 20
  condition: number; // out of 15
  positioningBranding: number; // out of 10
  evidenceCompleteness: number; // out of 5
  priorActionResolution: number; // out of 10
  rawTotal: number; // sum before override, 0-100
  finalScore: number; // after override cap, 0-100
  overrideApplied: boolean;
};

export function computeAuditScore(
  items: ScoredLineItem[],
  catalogue: Record<string, CatalogueInfo>,
  priorActions: { priorOpenCount: number; resolvedNowCount: number }
): ScoreBreakdown {
  const mandatoryPresence = weightedFailureDeduction(
    items, catalogue, 40,
    (c) => c.RequiredOptional === "Mandatory",
    ["Missing"]
  );

  const campaignPresence = weightedFailureDeduction(
    items, catalogue, 20,
    (c) => c.RequiredOptional === "Campaign-specific" && c.Status === "Active",
    ["Missing"]
  );

  const condition = weightedFailureDeduction(
    items, catalogue, 15,
    () => true,
    ["Damaged", "Outdated"]
  );

  const positioningBranding = weightedFailureDeduction(
    items, catalogue, 10,
    () => true,
    ["Incorrectly Positioned", "Incorrect Branding"]
  );

  const nonOk = items.filter((i) => i.conditionStatus !== "Present-OK");
  const evidenceCompleteness =
    nonOk.length === 0 ? 5 : 5 * (nonOk.filter((i) => i.hasPhoto).length / nonOk.length);

  const priorActionResolution =
    priorActions.priorOpenCount === 0
      ? 10
      : 10 * (priorActions.resolvedNowCount / priorActions.priorOpenCount);

  const rawTotal =
    mandatoryPresence + campaignPresence + condition + positioningBranding +
    evidenceCompleteness + priorActionResolution;

  const criticalHit = items.some(
    (i) =>
      CRITICAL_POS_ITEM_NAMES.includes(i.posName) &&
      (i.conditionStatus === "Missing" || i.conditionStatus === "Incorrect Branding")
  );

  const finalScore = criticalHit ? Math.min(rawTotal, CRITICAL_OVERRIDE_CAP) : rawTotal;

  return {
    mandatoryPresence, campaignPresence, condition, positioningBranding,
    evidenceCompleteness, priorActionResolution,
    rawTotal: Math.round(rawTotal * 10) / 10,
    finalScore: Math.round(finalScore * 10) / 10,
    overrideApplied: criticalHit,
  };
}

export function ragFromScore(score: number, greenThreshold: number, amberThreshold: number): "Green" | "Amber" | "Red" {
  if (score >= greenThreshold) return "Green";
  if (score >= amberThreshold) return "Amber";
  return "Red";
}

// Priority for auto-created Actions: driven by the POS item's Mandatory
// flag and how severe the condition issue is.
export function actionPriority(
  conditionStatus: ConditionStatus,
  requiredOptional: CatalogueInfo["RequiredOptional"]
): "Critical" | "High" | "Medium" | "Low" {
  if (conditionStatus === "Missing" && requiredOptional === "Mandatory") return "Critical";
  if (conditionStatus === "Incorrect Branding") return "High";
  if (requiredOptional === "Mandatory") return "High";
  if (conditionStatus === "Damaged" || conditionStatus === "Outdated") return "Medium";
  return "Low";
}
