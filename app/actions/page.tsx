import { getSession } from "@/lib/auth";
import { listRecords, TABLES } from "@/lib/airtable";
import ActionsTabs from "@/components/ActionsTabs";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export default async function ActionsPage() {
  // Role enforcement for this whole route lives in app/actions/layout.tsx
  // (guardRole(["Admin", "Marketing", "H&S"])) - by the time this page
  // renders, access is already confirmed. This just reads the session to
  // pick which tab (All vs H&S) an H&S login should land on by default.
  const session = await getSession();

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

  // Requires a linked location - a handful of fully-blank Action records
  // pre-date any real use of the app (same junk-row pattern found in POS
  // Requests). POS actions carry a Showroom link, H&S actions carry a Site
  // link (Actions.Site "generalises Showroom" - see the schema) - checking
  // both means this doesn't silently exclude every H&S action the way a
  // Showroom-only check used to (found 31 Aug 2026 while building the
  // POS/H&S split - H&S actions were invisible here entirely until now).
  const hasLocation = (a: any) => (a.fields.Showroom || []).length > 0 || (a.fields.Site || []).length > 0;

  // POS keeps the stricter rule: "Resolved" is visible as "awaiting next
  // audit to verify" rather than disappearing the moment someone marks a
  // fix done, since the fix isn't confirmed until an independent audit
  // reports that item back as Present-OK (see processAuditSubmission.ts).
  // H&S has no equivalent independent re-check - it's a self-reported
  // monthly walkaround, not a physical spot-check - so a self-marked
  // Resolved (with the notes box) is treated as done immediately and drops
  // out of the default view (Lorraine, 8 Sep 2026: "a tick box to say
  // Resolved... and then it could disappear, or move to a hidden 'resolved'
  // pot" - confirmed she wants immediate-disappear for H&S rather than
  // matching POS's stricter next-audit rule). Still recoverable via the
  // "Show resolved" toggle in ActionsTabs, not deleted.
  const open = actionRecords.filter((a) => {
    if (!hasLocation(a)) return false;
    if (a.fields.Status === "Verified-Closed") return false;
    if (classify(a) === "H&S" && a.fields.Status === "Resolved") return false;
    return true;
  });
  const resolvedHS = actionRecords.filter((a) => hasLocation(a) && classify(a) === "H&S" && a.fields.Status === "Resolved");

  function hsFoundViaKind(a: any): "roster" | "issue" | "training" | "risk" {
    if ((a.fields.RosterMismatch || []).length > 0) return "roster";
    const issue: string = a.fields.IssueDescription || "";
    // .includes() not .startsWith() - these now lead with "(Qn) " (Lorraine,
    // 8 Sep 2026 readable-labels request), so the phrase itself moved right.
    if (issue.includes("Training requested:")) return "training";
    if (issue.includes("Risk assessment requested:")) return "risk";
    return "issue";
  }

  function toRow(a: any) {
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
  }

  const sorted = open.sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.fields.Priority);
    const pb = PRIORITY_ORDER.indexOf(b.fields.Priority);
    if (pa !== pb) return pa - pb;
    return (a.fields.TargetCompletionDate || "").localeCompare(b.fields.TargetCompletionDate || "");
  });

  const rows = sorted.map(toRow);
  // H&S items self-marked Resolved - held separately so they can still be
  // found via the "Show resolved" toggle rather than vanishing outright.
  const resolvedRows = resolvedHS
    .sort((a, b) => (b.fields.DateCompleted || "").localeCompare(a.fields.DateCompleted || ""))
    .map(toRow);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Actions Tracker</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>{open.length} open actions across the estate</p>
      <ActionsTabs rows={rows} resolvedRows={resolvedRows} defaultTab={session?.role === "H&S" ? "H&S" : "All"} />
    </div>
  );
}
