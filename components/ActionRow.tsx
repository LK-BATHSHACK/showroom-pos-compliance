"use client";
import { useState } from "react";
import Link from "next/link";
import { PriorityBadge, SourceTypeBadge } from "./ui";

export default function ActionRow({
  action,
  showroomId,
  showroomName,
  source,
  foundVia,
}: {
  action: any;
  showroomId?: string;
  showroomName: string;
  // "POS" | "H&S" | "Other" - see app/actions/page.tsx's classification.
  source?: string;
  // Pre-built badge for whichever checklist type raised this action
  // (AuditTypeBadge for POS, HSFoundViaBadge for H&S) - built by the
  // caller so this component doesn't need to know about either.
  foundVia?: React.ReactNode;
}) {
  const [status, setStatus] = useState<string>(action.fields.Status);
  const [busy, setBusy] = useState(false);
  const overdue = action.fields.TargetCompletionDate && action.fields.TargetCompletionDate < new Date().toISOString().slice(0, 10);

  async function updateStatus(newStatus: "In progress" | "Resolved") {
    let resolutionNotes = "";
    if (newStatus === "Resolved") {
      const notes = window.prompt("What was done to fix this? (optional - shows in the audit history, doesn't need to be long)");
      if (notes === null) return; // cancelled
      resolutionNotes = notes;
    }
    setBusy(true);
    const res = await fetch(`/api/action/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, resolutionNotes }),
    });
    setBusy(false);
    if (res.ok) setStatus(newStatus);
  }

  return (
    <tr style={{ borderBottom: "1px solid #f2f2f2" }}>
      <td style={{ padding: "8px 6px" }}>
        {showroomId ? (
          <Link href={`/showroom/${showroomId}`} style={{ color: "#E6017E", textDecoration: "none" }}>
            {showroomName}
          </Link>
        ) : (
          showroomName
        )}
      </td>
      <td><SourceTypeBadge source={source} /></td>
      <td style={{ maxWidth: 320 }}>{action.fields.IssueDescription}</td>
      <td>{foundVia || "-"}</td>
      <td><PriorityBadge priority={action.fields.Priority} /></td>
      <td>{status}</td>
      <td>{action.fields.DateIdentified}</td>
      <td style={{ color: overdue ? "#d03b3b" : undefined, fontWeight: overdue ? 600 : 400 }}>
        {action.fields.TargetCompletionDate} {overdue ? "(overdue)" : ""}
      </td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          {status === "Open" && (
            <button
              disabled={busy}
              onClick={() => updateStatus("In progress")}
              style={{ background: "#fab219", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Start
            </button>
          )}
          {(status === "Open" || status === "In progress") && (
            <button
              disabled={busy}
              onClick={() => updateStatus("Resolved")}
              style={{ background: "#0ca30c", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Mark Resolved
            </button>
          )}
          {status === "Resolved" && (
            <span style={{ fontSize: 12, color: "#999" }}>Awaiting next audit to verify</span>
          )}
        </div>
      </td>
    </tr>
  );
}
