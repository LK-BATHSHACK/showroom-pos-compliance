"use client";

import { useMemo, useState } from "react";
import { Card, AuditTypeBadge, HSFoundViaBadge } from "@/components/ui";
import ActionRow from "@/components/ActionRow";

type Row = {
  action: any;
  source: "POS" | "H&S" | "Other";
  showroomId?: string;
  locationName: string;
  auditType?: string;
  hsKind?: "roster" | "issue" | "training" | "risk";
};

type Tab = "All" | "POS" | "H&S";

// Split requested 31 Aug 2026 (Lorraine: "different people manage those and
// the actions of them") - one page, filter tabs, rather than two separate
// pages, so nobody has to remember which URL covers which checklist.
export default function ActionsTabs({ rows }: { rows: Row[] }) {
  const [tab, setTab] = useState<Tab>("All");

  const counts = useMemo(
    () => ({
      All: rows.length,
      POS: rows.filter((r) => r.source === "POS").length,
      "H&S": rows.filter((r) => r.source === "H&S").length,
    }),
    [rows]
  );

  const visible = tab === "All" ? rows : rows.filter((r) => r.source === tab);

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee" }}>
        {(["All", "POS", "H&S"] as Tab[]).map((t) => (
          <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>
            {t} ({counts[t]})
          </TabButton>
        ))}
      </div>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Showroom / Site</th>
              <th>Type</th>
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
            {visible.map((r) => (
              <ActionRow
                key={r.action.id}
                action={r.action}
                showroomId={r.showroomId}
                showroomName={r.locationName}
                source={r.source}
                foundVia={
                  r.source === "POS" ? (
                    r.auditType ? <AuditTypeBadge auditType={r.auditType} /> : undefined
                  ) : r.source === "H&S" && r.hsKind ? (
                    <HSFoundViaBadge kind={r.hsKind} />
                  ) : undefined
                }
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: "16px 6px", color: "#999" }}>
                  Nothing open here.
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
