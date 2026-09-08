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
//
// Site + date filters and the "Show resolved" toggle added 8 Sep 2026
// (Lorraine: "could there be an option to filter by site/date? I can
// imagine that will get quite bunged up otherwise" + the H&S
// disappear-on-Resolved change - resolvedRows is where those went, kept one
// click away rather than gone for good).
export default function ActionsTabs({ rows, resolvedRows = [] }: { rows: Row[]; resolvedRows?: Row[] }) {
  const [tab, setTab] = useState<Tab>("All");
  const [showResolved, setShowResolved] = useState(false);
  const [site, setSite] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Lifted into local state (rather than reading `rows`/`resolvedRows`
  // props directly) so a resolve saved via the new Resolution area (8 Sep
  // 2026) can move a row out of the open list immediately - previously the
  // row's own "Resolved" text updated in place, but the row stayed sitting
  // in the visible table until the page was reloaded, since the props are
  // just a one-time server-rendered snapshot. That undermined the actual
  // point of "then it could disappear" from Lorraine's original ask.
  const [openRows, setOpenRows] = useState<Row[]>(rows);
  const [resolvedList, setResolvedList] = useState<Row[]>(resolvedRows);

  // Only H&S actually moves rows on resolve - POS deliberately stays visible
  // as "awaiting next audit to verify" (see app/actions/page.tsx), so a POS
  // resolve should keep showing in place, not disappear.
  function handleResolved(actionId: string, notes: string) {
    setOpenRows((prev) => {
      const idx = prev.findIndex((r) => r.action.id === actionId);
      if (idx === -1 || prev[idx].source !== "H&S") return prev;
      const row = prev[idx];
      const updatedRow: Row = {
        ...row,
        action: {
          ...row.action,
          fields: {
            ...row.action.fields,
            Status: "Resolved",
            ResolutionNotes: notes,
            DateCompleted: new Date().toISOString().slice(0, 10),
          },
        },
      };
      setResolvedList((list) => [updatedRow, ...list]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const counts = useMemo(
    () => ({
      All: openRows.length,
      POS: openRows.filter((r) => r.source === "POS").length,
      "H&S": openRows.filter((r) => r.source === "H&S").length,
    }),
    [openRows]
  );

  const sites = useMemo(
    () => Array.from(new Set([...openRows, ...resolvedList].map((r) => r.locationName))).sort(),
    [openRows, resolvedList]
  );

  const visible = useMemo(() => {
    const base = showResolved ? [...openRows, ...resolvedList] : openRows;
    const byTab = tab === "All" ? base : base.filter((r) => r.source === tab);
    return byTab.filter((r) => {
      if (site && r.locationName !== site) return false;
      const identified: string = r.action.fields.DateIdentified || "";
      if (dateFrom && identified < dateFrom) return false;
      if (dateTo && identified > dateTo) return false;
      return true;
    });
  }, [openRows, resolvedList, showResolved, tab, site, dateFrom, dateTo]);

  const inputStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: 13,
    border: "1px solid #ddd",
    borderRadius: 6,
    fontFamily: "inherit",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #eee" }}>
        {(["All", "POS", "H&S"] as Tab[]).map((t) => (
          <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>
            {t} ({counts[t]})
          </TabButton>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <select value={site} onChange={(e) => setSite(e.target.value)} style={inputStyle}>
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center" }}>
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center" }}>
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
        </label>
        {(site || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setSite("");
              setDateFrom("");
              setDateTo("");
            }}
            style={{ background: "none", border: "none", color: "#E6017E", fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            Clear filters
          </button>
        )}
        {resolvedList.length > 0 && (
          <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved ({resolvedList.length})
          </label>
        )}
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
                onResolved={(notes) => handleResolved(r.action.id, notes)}
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
