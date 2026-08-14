"use client";
import { useState } from "react";

export default function RequestRow({ request, showroomName }: { request: any; showroomName: string }) {
  const [status, setStatus] = useState(request.fields.Status);
  const [busy, setBusy] = useState(false);

  async function decide(newStatus: "Approved" | "Declined") {
    let marketingComments = "";
    if (newStatus === "Declined") {
      const reason = window.prompt("Reason for declining (this is emailed to the requester):");
      if (reason === null) return; // cancelled - don't decide without a reason
      marketingComments = reason;
    }
    setBusy(true);
    const res = await fetch(`/api/pos-request/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, marketingComments }),
    });
    setBusy(false);
    if (res.ok) setStatus(newStatus);
  }

  const isPending = status === "Submitted" || status === "Under Review";

  return (
    <tr style={{ borderBottom: "1px solid #f2f2f2" }}>
      <td style={{ padding: "8px 6px" }}>{showroomName}</td>
      <td style={{ maxWidth: 280 }}>{request.fields.IdeaDescription}</td>
      <td>{request.fields.RequesterName || "-"}</td>
      <td>{request.fields.Urgency}</td>
      <td>{status}</td>
      <td>
        {isPending && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              disabled={busy}
              onClick={() => decide("Approved")}
              style={{ background: "#0ca30c", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Approve
            </button>
            <button
              disabled={busy}
              onClick={() => decide("Declined")}
              style={{ background: "#d03b3b", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
            >
              Decline
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
