export const RAG_COLORS: Record<string, string> = {
  Green: "#0ca30c",
  Amber: "#fab219",
  Red: "#d03b3b",
};

export function RagBadge({ rag }: { rag?: string }) {
  const color = RAG_COLORS[rag || ""] || "#999";
  return (
    <span
      style={{
        display: "inline-block",
        background: color,
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 10px",
        borderRadius: 999,
      }}
    >
      {rag || "No data"}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#d03b3b",
  High: "#e8622c",
  Medium: "#fab219",
  Low: "#8a8a8a",
};

export function PriorityBadge({ priority }: { priority?: string }) {
  const color = PRIORITY_COLORS[priority || ""] || "#999";
  return (
    <span style={{ color, fontWeight: 600, fontSize: 13 }}>
      {priority || "-"}
    </span>
  );
}

// Distinguishes Jordan's in-person spot checks from showrooms' own monthly
// self-reports (and the older remote-checklist type) at a glance - added
// 14 Aug 2026 because the Overview table and Actions Tracker were showing
// one blended number/list with no visible tag for which check produced it,
// even though every Audit record has always carried this on AuditType.
const AUDIT_TYPE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  "Physical (Group A)": { label: "Physical spot check", bg: "#FFE6F3", fg: "#B0005F" },
  "Remote (Group B)": { label: "Remote checklist", bg: "#E8EEFF", fg: "#3348B0" },
  "Self-Reported (Monthly)": { label: "Self-reported", bg: "#EFEFEF", fg: "#555" },
};

export function AuditTypeBadge({ auditType }: { auditType?: string }) {
  const style = (auditType && AUDIT_TYPE_STYLE[auditType]) || { label: auditType || "-", bg: "#EFEFEF", fg: "#999" };
  return (
    <span
      style={{
        display: "inline-block",
        background: style.bg,
        color: style.fg,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {style.label}
    </span>
  );
}

// Which checklist type raised an Action - added 31 Aug 2026 so the Actions
// Tracker can split POS from H&S (different people manage each). Classified
// at read time from which "SourceX" link is populated (SourceAuditLineItem
// = POS, SourceAnswer = H&S) - see app/actions/page.tsx - rather than
// stored on the record, since every existing and future Action already
// carries exactly one of those regardless of intake path.
const SOURCE_TYPE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  POS: { label: "POS", bg: "#FFE6F3", fg: "#B0005F" },
  "H&S": { label: "H&S", bg: "#E6F7EF", fg: "#0A7A4A" },
  Other: { label: "Other", bg: "#EFEFEF", fg: "#999" },
};

export function SourceTypeBadge({ source }: { source?: string }) {
  const style = (source && SOURCE_TYPE_STYLE[source]) || SOURCE_TYPE_STYLE.Other;
  return (
    <span style={{ display: "inline-block", background: style.bg, color: style.fg, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {style.label}
    </span>
  );
}

// H&S's own "found via" split - mirrors the two categories hs-review/page.tsx
// already showed (Roster/poster vs Reported issue), plus the two
// training/risk-assessment request kinds from lib/hsSubmission.ts.
const HS_FOUND_VIA_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  roster: { label: "Roster/poster mismatch", bg: "#FFF4E0", fg: "#966400" },
  issue: { label: "Reported issue", bg: "#EFEFEF", fg: "#555" },
  training: { label: "Training request", bg: "#E8EEFF", fg: "#3348B0" },
  risk: { label: "Risk assessment request", bg: "#E8EEFF", fg: "#3348B0" },
};

export function HSFoundViaBadge({ kind }: { kind: "roster" | "issue" | "training" | "risk" }) {
  const style = HS_FOUND_VIA_STYLE[kind] || HS_FOUND_VIA_STYLE.issue;
  return (
    <span style={{ display: "inline-block", background: style.bg, color: style.fg, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {style.label}
    </span>
  );
}

// New Idea (doesn't exist yet) vs Replacement/Support Request (need more
// of / fix something that already exists) - split out 31 Aug 2026 per
// Lorraine ("POS request and submit new idea are different things").
// Falls back to "New Idea" styling for older requests with no RequestType
// set at all (pre-dates this field).
const REQUEST_TYPE_STYLE: Record<string, { label: string; bg: string; fg: string }> = {
  "New Idea": { label: "New Idea", bg: "#E8EEFF", fg: "#3348B0" },
  "Replacement/Support Request": { label: "Replacement/Support", bg: "#FFF4E0", fg: "#966400" },
};

export function RequestTypeBadge({ requestType }: { requestType?: string }) {
  const style = (requestType && REQUEST_TYPE_STYLE[requestType]) || REQUEST_TYPE_STYLE["New Idea"];
  return (
    <span style={{ display: "inline-block", background: style.bg, color: style.fg, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {style.label}
    </span>
  );
}

export function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, color: "#6E6E6E", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#1D1C1D" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {title && <h3 style={{ marginTop: 0, fontSize: 16 }}>{title}</h3>}
      {children}
    </div>
  );
}
