import { listRecords, TABLES } from "@/lib/airtable";
import ActionsTabs from "@/components/ActionsTabs";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export default async function ActionsPage() {
  const [actionRecords, showroomRecords, siteRecords, lineItemRecords, auditRecords] = await Promise.all([
    listRecords<any>(TABLES.ACTIONS),
    listRecords<{ ShowroomName: string }>(TABLES.SHOWROOMS),
    listRecords<{ SiteName: string }>(TABLES.SITES),
    listRecords<{ Audit?: string[] }>(TABLES.AUDIT_LINE_ITEMS),
    listRecords<{ AuditType?: string }>(TABLES.AUDITS),
  ]);

  const showroomNameById: Record<string, string> = {};
  showroomRecords.forEach((s) => (showroomNameById[s.id] = s.fields.ShowroomName));
  const siteNameById: Record<string, string> = {};
  siteRecords.forEach((s) => (siteNameById[s.id] = s.fields.SiteName));

  // Trace each POS action back to the audit that raised it (Action ->
  // SourceAuditLineItem -> Audit Line Item -> Audit -> AuditType) so the
  // tracker can show whether a flagged issue came from Jordan's physical
  // spot check, a self-report, or a remote checklist.
  const auditTypeById: Record<string, string> = {};
  auditRecords.forEach((a) => (auditTypeById[a.id] = a.fields.AuditType || ""));
  const auditTypeByLineItemId: Record<string, string> = {};
  lineItemRecords.forEach((li) => {
    const auditId = li.fields.Audit?.[0];
    if (auditId) auditTypeByLineItemId[li.id] = auditTypeById[auditId] || "";
  });

  // Shows everything not yet fully closed out, including "Resolved" items -
  // those are visible here as "awaiting next audit to verify" rather than
  // disappearing the moment the designer marks a fix done, since the fix
  // isn't confirmed until an independent audit reports that item back as
  // Present-OK (see the auto-verification step in processAuditSubmission.ts).
  //
  // Also requires a linked location - a handful of fully-blank Action
  // records pre-date any real use of the app (same junk-row pattern found
  // in POS Requests). POS actions carry a Showroom link, H&S actions carry
  // a Site link (Actions.Site "generalises Showroom" - see the schema) -
  // checking both means this doesn't silently exclude every H&S action the
  // way a Showroom-only check used to (found 31 Aug 2026 while building the
  // POS/H&S split - H&S actions were invisible here entirely until now).
  const open = actionRecords.filter(
    (a) => a.fields.Status !== "Verified-Closed" && ((a.fields.Showroom || []).length > 0 || (a.fields.Site || []).length > 0)
  );

  // Classification: every Action created by the POS pipeline (old migrated
  // data, any Excel upload, or the new in-tool POS Walkaround form) sets
  // SourceAuditLineItem; every H&S action sets SourceAnswer instead. Neither
  // pipeline ever writes both, so this is a robust, source-agnostic split
  // without needing to trace through Template Questions/Templates the way
  // hs-review/page.tsx does (that tracing only works for H&S - the POS
  // pipeline never populates SourceAnswer at all, so it can't classify POS
  // actions).
  function classify(a: any): "POS" | "H&S" | "Other" {
    if ((a.fields.SourceAuditLineItem || []).length > 0) return "POS";
    if ((a.fields.SourceAnswer || []).length > 0) return "H&S";
    return "Other";
  }

  function hsFoundViaKind(a: any): "roster" | "issue" | "training" | "risk" {
    if ((a.fields.RosterMismatch || []).length > 0) return "roster";
    const issue: string = a.fields.IssueDescription || "";
    if (issue.startsWith("Training requested:")) return "training";
    if (issue.startsWith("Risk assessment requested:")) return "risk";
    return "issue";
  }

  const sorted = open.sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.fields.Priority);
    const pb = PRIORITY_ORDER.indexOf(b.fields.Priority);
    if (pa !== pb) return pa - pb;
    return (a.fields.TargetCompletionDate || "").localeCompare(b.fields.TargetCompletionDate || "");
  });

  const rows = sorted.map((a) => {
    const source = classify(a);
    const showroomId = a.fields.Showroom?.[0];
    const siteId = a.fields.Site?.[0];
    const locationName = showroomId ? showroomNameById[showroomId] : siteId ? siteNameById[siteId] : "-";
    const lineItemId = a.fields.SourceAuditLineItem?.[0];
    const auditType = lineItemId ? auditTypeByLineItemId[lineItemId] : "";
    return {
      action: a,
      source,
      showroomId, // undefined for H&S rows - ActionRow renders plain text (no drill-down page for Sites yet)
      locationName,
      auditType,
      hsKind: source === "H&S" ? hsFoundViaKind(a) : undefined,
    };
  });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Actions Tracker</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>{open.length} open actions across the estate</p>
      <ActionsTabs rows={rows} />
    </div>
  );
}
