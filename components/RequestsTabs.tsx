"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import RequestRow from "@/components/RequestRow";

type Row = { request: any; showroomName: string };
type Tab = "All" | "New Idea" | "Replacement/Support Request";

const TABS: { key: Tab; label: string }[] = [
  { key: "All", label: "All" },
  { key: "New Idea", label: "New Idea" },
  { key: "Replacement/Support Request", label: "Replacement/Support" },
];

// Split requested 31 Aug 2026 (Lorraine: "POS request and submit new idea
// are different things ... can we have those clarified and split a bit
// more?") - same one-page/filter-tabs pattern as the Actions Tracker split.
// Requests with no RequestType at all (pre-date this field) count as "New
// Idea" here, matching RequestTypeBadge's own fallback.
export default function RequestsTabs({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState<Tab>("All");

  function typeOf(r: Row): Tab {
    return r.request.fields.RequestType === "Replacement/Support Request" ? "Replacement/Support Request" : "New Idea";
  }

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { All: rows.length, "New Idea": 0, "Replacement/Support Request": 0 };
    rows.forEach((r) => c[typeOf(r)]++);
    return c;
  }, [rows]);

  const visible = tab === "All" ? rows : rows.filter((r) => typeOf(r) === tab);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee" }}>
        {TABS.map((t) => (
          <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label} ({counts[t.key]})
          </TabButton>
        ))}
      </div>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom</th>
              <th>Type</th>
              <th>Idea</th>
              <th>Requester</th>
              <th>Urgency</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <RequestRow key={r.request.id} request={r.request} showroomName={r.showroomName} />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "16px 6px", color: "#999" }}>
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid #E6017E" : "2px solid transparent",
        color: active ? "#E6017E" : "#6E6E6E",
        fontWeight: active ? 600 : 500,
        fontSize: 14,
        padding: "10px 16px",
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}
