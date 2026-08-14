import { listRecords, TABLES } from "@/lib/airtable";
import { Card } from "@/components/ui";
import ActionRow from "@/components/ActionRow";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

export default async function ActionsPage() {
  const [actionRecords, showroomRecords, lineItemRecords, auditRecords] = await Promise.all([
    listRecords<any>(TABLES.ACTIONS),
    listRecords<{ ShowroomName: string }>(TABLES.SHOWROOMS),
    listRecords<{ Audit?: string[] }>(TABLES.AUDIT_LINE_ITEMS),
    listRecords<{ AuditType?: string }>(TABLES.AUDITS),
  ]);

  const showroomNameById: Record<string, string> = {};
  showroomRecords.forEach((s) => (showroomNameById[s.id] = s.fields.ShowroomName));

  // Trace each action back to the audit that raised it (Action ->
  // SourceAuditLineItem -> Audit Line Item -> Audit -> AuditType) so the
  // tracker can show whether a flagged issue came from Jordan's physical
  // spot check, a self-report, or a remote checklist - added 14 Aug 2026,
  // this was previously invisible here even though the data always carried it.
  const auditTypeById: Record<string, string> = {};
  auditRecords.forEach((a) => (auditTypeById[a.id] = a.fields.AuditType || ""));
  const auditTypeByLineItemId: Record<string, string> = {};
  lineItemRecords.forEach((li) => {
    const auditId = li.fields.Audit?.[0];
    if (auditId) auditTypeByLineItemId[li.id] = auditTypeById[auditId] || "";
  });

  const today = new Date().toISOString().slice(0, 10);
  // Shows everything not yet fully closed out, including "Resolved" items -
  // those are visible here as "awaiting next audit to verify" rather than
  // disappearing the moment the designer marks a fix done, since the fix
  // isn't confirmed until an independent audit reports that item back as
  // Present-OK (see the auto-verification step in processAuditSubmission.ts).
  //
  // Also requires a linked Showroom - a handful of fully-blank Action
  // records pre-date any real use of the app (same junk-row pattern found
  // in POS Requests). Their Status field is blank, which is not
  // "Verified-Closed" either, so without this extra check they'd render as
  // empty rows at the top of the tracker (found 14 Aug 2026, caused by
  // widening this filter to keep "Resolved" items visible - blank-status
  // junk rows used to be excluded only by coincidence, since blank was
  // never "Open" or "In Progress").
  const open = actionRecords.filter((a) => a.fields.Status !== "Verified-Closed" && (a.fields.Showroom || []).length > 0);

  const sorted = open.sort((a, b) => {
    const pa = PRIORITY_ORDER.indexOf(a.fields.Priority);
    const pb = PRIORITY_ORDER.indexOf(b.fields.Priority);
    if (pa !== pb) return pa - pb;
    return (a.fields.TargetCompletionDate || "").localeCompare(b.fields.TargetCompletionDate || "");
  });

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Actions Tracker</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>{open.length} open actions across the estate</p>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom</th>
              <th>Issue</th>
              <th>Found via</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Identified</th>
              <th>Target</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const showroomId = a.fields.Showroom?.[0];
              const showroomName = showroomId ? showroomNameById[showroomId] : "-";
              const lineItemId = a.fields.SourceAuditLineItem?.[0];
              const auditType = lineItemId ? auditTypeByLineItemId[lineItemId] : "";
              return <ActionRow key={a.id} action={a} showroomId={showroomId} showroomName={showroomName} auditType={auditType} />;
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
