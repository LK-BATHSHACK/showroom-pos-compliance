"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { UpdateView } from "@/components/ConsumablesUpdateSummary";
import ConsumablesUpdateHistory from "@/components/ConsumablesUpdateHistory";

type Row = {
  id: string;
  dateRequested: string;
  status: string;
  lines: { id: string; itemName: string; quantity: number }[];
  update: UpdateView | null;
  updates: UpdateView[];
};

// Shown to a Store Manager INSTEAD of the request form while their site has
// an order that isn't Fulfilled yet (Lorraine, 6 Oct 2026: "No orders made
// until marked as fulfilled"). Puts the open order and its "Mark as received"
// button right at the top, so the one thing blocking a new request is also the
// one thing they can do about it. Marking received refreshes the page and the
// form comes back.
export default function ConsumablesOpenOrderNotice({ rows }: { rows: Row[] }) {
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
    <Card title={rows.length === 1 ? "You have an open request" : `You have ${rows.length} open requests`}>
      <p style={{ marginTop: 0, fontSize: 14 }}>
        You can request more once {rows.length === 1 ? "this order has" : "these orders have"} arrived and been marked as received.
      </p>
      {error && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => {
          const sent = r.status === "Sent";
          return (
            <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>Requested {r.dateRequested}</strong>
                <span
                  style={{
                    background: sent ? "#E8EEFF" : "#FFEBB0",
                    color: sent ? "#3348B0" : "#966400",
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "2px 10px",
                    borderRadius: 999,
                  }}
                >
                  {r.status}
                </span>
              </div>
              <div style={{ fontSize: 14 }}>
                {r.lines.map((l) => (
                  <div key={l.id}>
                    {l.itemName} &times; {l.quantity}
                  </div>
                ))}
              </div>
              <ConsumablesUpdateHistory updates={r.updates} />
              <p style={{ color: "#6E6E6E", fontSize: 13, margin: "8px 0" }}>
                {sent
                  ? "Chris has sent this. Once it arrives, tap the button below."
                  : "Waiting for Chris to send this. If it has already arrived, tap the button below."}
              </p>
              <button
                type="button"
                onClick={() => markReceived(r.id)}
                disabled={savingId === r.id}
                style={{
                  background: "#E6017E",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {savingId === r.id ? "Saving..." : "Mark as received"}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
