"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import ConsumablesUpdateSummary, { type UpdateView } from "@/components/ConsumablesUpdateSummary";

type Line = { id: string; itemName: string; quantity: number; notes: string | null };
type Row = {
  id: string;
  dateRequested: string;
  status: string;
  notes: string | null;
  lines: Line[];
  update: UpdateView | null;
  receivedByName: string | null;
  receivedDate: string | null;
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Requested: { bg: "#FFEBB0", fg: "#966400" },
  Sent: { bg: "#E8EEFF", fg: "#3348B0" },
  Fulfilled: { bg: "#DFF5DF", fg: "#1E7A1E" },
};

// A Store Manager's own site's requests. Shows Chris's delivery update
// (packages, how/when, photos) and lets the store mark an order as received
// when it arrives, which sets it to Fulfilled (Lorraine, 25 Sep 2026).
export default function ConsumablesHistoryTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function markReceived(id: string) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/consumables-request/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Fulfilled" }),
      });
      if (!res.ok) {
        let msg = "Couldn't update - please try again.";
        try {
          msg = (await res.json()).error || msg;
        } catch {}
        setError(msg);
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server - check your connection and try again.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card title={`Your requests (${rows.length})`}>
      {error && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: "8px 6px" }}>Date</th>
            <th>Items</th>
            <th>Note / update</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const style = STATUS_STYLE[r.status] || STATUS_STYLE.Requested;
            return (
              <tr key={r.id} style={{ borderBottom: "1px solid #f2f2f2", verticalAlign: "top" }}>
                <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{r.dateRequested}</td>
                <td>
                  {r.lines.map((l) => (
                    <div key={l.id}>
                      {l.itemName} &times; {l.quantity}
                    </div>
                  ))}
                </td>
                <td style={{ color: "#6E6E6E", fontSize: 13 }}>
                  {r.notes || (r.update ? null : "-")}
                  {r.update && <ConsumablesUpdateSummary update={r.update} />}
                </td>
                <td>
                  <span style={{ background: style.bg, color: style.fg, fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999 }}>
                    {r.status}
                  </span>
                  {r.status === "Fulfilled" && r.receivedDate && (
                    <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                      Received {r.receivedDate}
                      {r.receivedByName ? ` by ${r.receivedByName}` : ""}
                    </div>
                  )}
                  {r.status !== "Fulfilled" && (
                    <button
                      type="button"
                      onClick={() => markReceived(r.id)}
                      disabled={savingId === r.id}
                      style={{
                        display: "block",
                        marginTop: 6,
                        background: r.status === "Sent" ? "#E6017E" : "none",
                        color: r.status === "Sent" ? "#fff" : "#6E6E6E",
                        border: r.status === "Sent" ? "none" : "1px solid #ddd",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {savingId === r.id ? "Saving..." : "Mark as received"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "16px 6px", color: "#999" }}>
                No requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
