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
  // Mirrors action.fields, but overlaid with whatever the server actually
  // saved on a status change (ResolutionNotes / MaintenancePlanner* etc) so
  // the note panels below show up immediately rather than only after a page
  // reload - the `action` prop itself is a one-time server snapshot that
  // doesn't otherwise update just because local `status` did.
  const [fields, setFields] = useState<Record<string, any>>(action.fields);
  const [busy, setBusy] = useState(false);
  const overdue = action.fields.TargetCompletionDate && action.fields.TargetCompletionDate < new Date().toISOString().slice(0, 10);

  // Resolution area (Lorraine, 8 Sep 2026: "a tick box to say 'Resolved'
  // then a notes box to say 'how it was resolved'") - replaces the earlier
  // window.prompt() flow with an inline tick box + notes box right in the
  // row, since a browser popup wasn't what she pictured. Ticking the box
  // reveals the notes field; unticking it cancels without saving (same
  // "cancel = no change" behaviour the old prompt() had on Cancel).
  //
  // "MP" (added to Maintenance Planner) added 10 Sep 2026 - Lorraine: "could
  // there be another button perhaps called MP that doesn't fully CLOSE the
  // issue, but 'part closes' it... Zara's bit is resolved, but it's worth
  // keeping 'open' until we can close the loop and say the work has been
  // completed." Same tick-box-then-notes shape as Resolved, just a
  // different destination status that deliberately does NOT count as
  // resolved anywhere else in the app (stays in the open list, still counts
  // toward "open" KPIs, still eligible to be marked Resolved later once the
  // work's actually done). `pending` replaces the old boolean `resolving` so
  // only one of the two areas can be open at a time.
  const [pending, setPending] = useState<"resolve" | "mp" | null>(null);
  const [notes, setNotes] = useState("");

  async function updateStatus(newStatus: "In progress" | "Resolved" | "Added to Maintenance Planner", noteText = "") {
    setBusy(true);
    const res = await fetch(`/api/action/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, notes: noteText }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setStatus(newStatus);
      if (body.record?.fields) setFields((f) => ({ ...f, ...body.record.fields }));
      setPending(null);
      setNotes("");
      if (newStatus === "Resolved") onResolved?.(noteText);
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
      <td style={{ minWidth: pending ? 220 : undefined }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {status === "Open" && (
              <button
                disabled={busy}
                onClick={() => updateStatus("In progress")}
                // Salli, 9 Sep 2026: "I'm not sure what the 'start' button is
                // for? is that for us to know 'its' being looked into?" -
                // yes, exactly that; the button itself stays short (it's a
                // table cell) but a hover tooltip spells out what it does.
                title="Marks this as In progress, so everyone can see it's being looked into (doesn't resolve it - tick Resolved for that once it's actually fixed)."
                style={{ background: "#fab219", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
              >
                Start
              </button>
            )}
            {/* Resolved stays available even once something is "Added to
                Maintenance Planner" - MP is a part-close, not a close, so
                the loop still needs closing later once the work's actually
                done (Lorraine, 10 Sep 2026). */}
            {(status === "Open" || status === "In progress" || status === "Added to Maintenance Planner") && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pending === "resolve"}
                  disabled={busy}
                  onChange={(e) => setPending(e.target.checked ? "resolve" : null)}
                />
                Resolved
              </label>
            )}
            {/* "MP" (added to Maintenance Planner) - Lorraine, 10 Sep 2026:
                "someone raises an issue, Zara adds to the maintenance
                planner - we need to perhaps not say RESOLVED because Rory
                might not get to it for a couple of months... Zara's bit is
                resolved, but it's worth keeping 'open' until we can close
                the loop." Only offered before it's already been MP'd -
                once it has, the only way forward is Resolved (or leave it
                as is). */}
            {(status === "Open" || status === "In progress") && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pending === "mp"}
                  disabled={busy}
                  onChange={(e) => setPending(e.target.checked ? "mp" : null)}
                />
                MP
              </label>
            )}
            {status === "Resolved" && (
              <span style={{ fontSize: 12, color: "#999" }}>
                {source === "H&S" ? "Resolved" : "Awaiting next audit to verify"}
              </span>
            )}
          </div>
          {/* Salli, 9 Sep 2026: "When you click the SHOW RESOLVED filter, it
              doesn't show 'how it was resolved' so that information is gone -
              can it be shown?" - the notes typed into the Resolution area
              above were being saved (Round 8) but never displayed anywhere
              once a row moved to Resolved. Shown for any resolved action that
              has notes, not just H&S, since the field/flow is shared. */}
          {status === "Resolved" && fields.ResolutionNotes && (
            <div style={{ fontSize: 12, color: "#333", background: "#F5F5F5", borderRadius: 4, padding: "6px 8px", maxWidth: 260 }}>
              <span style={{ color: "#6E6E6E" }}>How it was resolved: </span>
              {fields.ResolutionNotes}
            </div>
          )}
          {status === "Added to Maintenance Planner" && (
            <div style={{ fontSize: 12, color: "#333", background: "#E8EEFF", borderRadius: 4, padding: "6px 8px", maxWidth: 260 }}>
              <span style={{ color: "#3348B0", fontWeight: 600 }}>Added to maintenance planner</span>
              {fields.MaintenancePlannerByName && (
                <>
                  {" "}
                  by {fields.MaintenancePlannerByName}
                  {fields.MaintenancePlannerDate ? ` - ${fields.MaintenancePlannerDate}` : ""}
                </>
              )}
              {fields.MaintenancePlannerNotes && (
                <div style={{ marginTop: 2 }}>{fields.MaintenancePlannerNotes}</div>
              )}
            </div>
          )}
          {/* Resolution/MP notes area - appears once either box is ticked.
              Untick to cancel (no PATCH sent, nothing saved). Shares one
              textarea since only one can be open at a time. */}
          {pending && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={pending === "resolve" ? "How was this resolved? (optional)" : "Note for the maintenance planner? (optional)"}
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
                onClick={() => updateStatus(pending === "resolve" ? "Resolved" : "Added to Maintenance Planner", notes)}
                style={{
                  background: pending === "resolve" ? "#0ca30c" : "#3348B0",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
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
