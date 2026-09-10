"use client";

import { useMemo, useState } from "react";

export type HSOpenActionRow = {
  id: string;
  site: string;
  questionRef: string;
  section: string | null;
  issue: string;
  priority: string;
  identified: string;
  typeLabel: string;
};

type SortBy = "Priority" | "Site" | "Date identified";
const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

// Section + Sort-by filter for H&S Review's Open follow-up actions table -
// same controls as the Actions Tracker (Salli/Zara, 9 Sep 2026: "a
// filter/sort option... showroom by showroom" / "a filter... if I was
// looking for one that involved fire warden"). Split into its own client
// component since the rest of app/hs-review/page.tsx is a plain server
// component with no other interactivity.
export default function HSOpenActionsTable({ rows }: { rows: HSOpenActionRow[] }) {
  const [site, setSite] = useState("");
  const [section, setSection] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("Priority");

  const sites = useMemo(() => Array.from(new Set(rows.map((r) => r.site))).sort(), [rows]);
  const sections = useMemo(
    () => Array.from(new Set(rows.map((r) => r.section).filter((s): s is string => !!s))).sort(),
    [rows]
  );

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (site && r.site !== site) return false;
      if (section && r.section !== section) return false;
      return true;
    });
    if (sortBy === "Priority") {
      return [...filtered].sort((a, b) => {
        const pa = PRIORITY_ORDER.indexOf(a.priority);
        const pb = PRIORITY_ORDER.indexOf(b.priority);
        return pa - pb;
      });
    }
    const sorted = [...filtered];
    if (sortBy === "Site") sorted.sort((a, b) => a.site.localeCompare(b.site));
    else if (sortBy === "Date identified") sorted.sort((a, b) => a.identified.localeCompare(b.identified));
    return sorted;
  }, [rows, site, section, sortBy]);

  const inputStyle: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: 13,
    border: "1px solid #ddd",
    borderRadius: 6,
    fontFamily: "inherit",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {sites.length > 0 && (
          <select value={site} onChange={(e) => setSite(e.target.value)} style={inputStyle}>
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        {sections.length > 0 && (
          <select value={section} onChange={(e) => setSection(e.target.value)} style={inputStyle}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center" }}>
          Sort by
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={inputStyle}>
            <option value="Priority">Priority</option>
            <option value="Site">Site (showroom by showroom)</option>
            <option value="Date identified">Date identified</option>
          </select>
        </label>
        {(site || section || sortBy !== "Priority") && (
          <button
            type="button"
            onClick={() => {
              setSite("");
              setSection("");
              setSortBy("Priority");
            }}
            style={{ background: "none", border: "none", color: "#E6017E", fontSize: 13, cursor: "pointer", padding: 0 }}
          >
            Clear filters
          </button>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: "6px 4px" }}>Site</th>
            <th>Question</th>
            <th>Section</th>
            <th>Issue</th>
            <th>Priority</th>
            <th>Identified</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
              <td style={{ padding: "8px 4px" }}>{r.site}</td>
              <td style={{ color: "#6E6E6E", whiteSpace: "nowrap" }}>{r.questionRef || "-"}</td>
              <td style={{ color: "#6E6E6E" }}>{r.section || "-"}</td>
              <td>{r.issue}</td>
              <td>{r.priority}</td>
              <td>{r.identified}</td>
              <td>{r.typeLabel}</td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr><td colSpan={7} style={{ padding: "16px 4px", color: "#999" }}>Nothing matches this filter.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
