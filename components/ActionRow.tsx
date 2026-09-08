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
  onResolved,
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
  // Called after a successful "Resolved" save (with the resolution notes)
  // so the parent (ActionsTabs) can move the row out of the open list
  // immediately, rather than it just sitting there re-labelled until the
  // page is reloaded. Not called for "In progress".
  onResolved?: (resolutionNotes: string) => void;
}) {
  const [status, setStatus] = useState<string>(action.fields.Status);
  const [busy, setBusy] = useState(false);
  const overdue = action.fields.TargetCompletionDate && action.fields.TargetCompletionDate < new Date().toISOString().slice(0, 10);

  // Resolution area (Lorraine, 8 Sep 2026: "a tick box to say 'Resolved'
  // then a notes box to say 'how it was resolved'") - replaces the earlier
  // window.prompt() flow with an inline tick box + notes box right in the
  // row, since a browser popup wasn't what she pictured. Ticking the box
  // reveals the notes field; unticking it cancels without saving (same
  // "cancel = no change" behaviour the old prompt() had on Cancel).
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState("");

  async function updateStatus(newStatus: "In progress" | "Resolved", resolutionNotes = "") {
    setBusy(true);
    const res = await fetch(`/api/action/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, resolutionNotes }),
    });
    setBusy(false);
    if (res.ok) {
      setStatus(newStatus);
      setResolving(false);
      setNotes("");
      if (newStatus === "Resolved") onResolved?.(resolutionNotes);
    }
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
      <td style={{ minWidth: resolving ? 220 : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={resolving}
                  disabled={busy}
                  onChange={(e) => setResolving(e.target.checked)}
                />
                Resolved
              </label>
            )}
            {status === "Resolved" && (
              <span style={{ fontSize: 12, color: "#999" }}>
                {source === "H&S" ? "Resolved" : "Awaiting next audit to verify"}
              </span>
            )}
          </div>
          {/* Resolution area - appears once "Resolved" is ticked. Untick to
              cancel (no PATCH sent, nothing saved). */}
          {resolving && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How was this resolved? (optional)"
                rows={2}
                style={{
                  fontSize: 12,
                  fontFamily: "inherit",
                  padding: "6px 8px",
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  resize: "vertical",
                }}
              />
              <button
                disabled={busy}
                onClick={() => updateStatus("Resolved", notes)}
                style={{ background: "#0ca30c", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", alignSelf: "flex-start" }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
