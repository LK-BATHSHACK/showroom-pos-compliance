"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/ui";

export type ScoreSite = { id: string; name: string };
export type ScoreSubmission = { siteId: string; date: string };
export type ScoreAction = {
  siteId: string;
  dateIdentified: string;
  status: string;
  urgencyClass?: string;
};

type Tier = "not-audited" | "green" | "amber" | "amber-dark" | "red";

const TIER_META: Record<Tier, { label: string; score: number | null; bg: string; fg: string }> = {
  "not-audited": { label: "No H&S check this month", score: null, bg: "#F0F0F0", fg: "#6E6E6E" },
  green: { label: "GREEN", score: 0, bg: "#DFF5DF", fg: "#1E7A1E" },
  amber: { label: "AMBER", score: 1, bg: "#FFEBB0", fg: "#966400" },
  "amber-dark": { label: "AMBER (higher)", score: 3, bg: "#F5C36B", fg: "#7A4A00" },
  red: { label: "RED", score: 5, bg: "#F8D2D2", fg: "#B01818" },
};

// Salli's rubric (9 Sep 2026): "For the Level of Concern, I would want it to
// look at a submission and based on the amount of issues that end up on the
// Actions tracker, give it a score... 0 - no issues, GREEN / 1 - 1-2 small
// issues, AMBER / 3 - more than 2 issues, Darker AMBER / 5 - Urgent safety
// concern or issues unresolved in over 1 month, RED."
//
// Two things had to be assumed rather than confirmed with Lorraine (flagged
// here the same way HS_MONTHLY_DUE_DAY is flagged in lib/hsSubmission.ts):
// - "Urgent safety concern" = an action raised with UrgencyClass "Immediate"
//   (the same flag that already triggers the accident/incident escalation
//   email) at that site in that month.
// - "Unresolved in over 1 month" = the site currently has ANY action still
//   Open/In progress whose DateIdentified is more than 30 days ago, checked
//   against today's real date rather than the selected month's end - this
//   is inherently a snapshot ("how stale is this site's queue right now"),
//   not something that can be reconstructed cleanly for a past month.
const STALE_DAYS = 30;

function computeScore(
  site: ScoreSite,
  month: string,
  submissions: ScoreSubmission[],
  actions: ScoreAction[],
  todayStr: string
): { tier: Tier; issueCount: number; urgent: boolean; stale: boolean } {
  const auditedThisMonth = submissions.some((s) => s.siteId === site.id && s.date.startsWith(month));
  const actionsThisMonth = actions.filter((a) => a.siteId === site.id && a.dateIdentified.startsWith(month));
  const issueCount = actionsThisMonth.length;
  const urgent = actionsThisMonth.some((a) => a.urgencyClass === "Immediate");
  const stale = actions.some((a) => {
    if (a.siteId !== site.id) return false;
    if (a.status !== "Open" && a.status !== "In progress") return false;
    if (!a.dateIdentified) return false;
    const days = (Date.parse(todayStr) - Date.parse(a.dateIdentified)) / (1000 * 60 * 60 * 24);
    return days > STALE_DAYS;
  });

  if (!auditedThisMonth) return { tier: "not-audited", issueCount, urgent, stale };
  if (urgent || stale) return { tier: "red", issueCount, urgent, stale };
  if (issueCount > 2) return { tier: "amber-dark", issueCount, urgent, stale };
  if (issueCount >= 1) return { tier: "amber", issueCount, urgent, stale };
  return { tier: "green", issueCount, urgent, stale };
}

export default function ShowroomScoresPanel({
  sites,
  submissions,
  actions,
}: {
  sites: ScoreSite[];
  submissions: ScoreSubmission[];
  actions: ScoreAction[];
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [month, setMonth] = useState(today.slice(0, 7));

  const rows = useMemo(
    () =>
      sites
        .map((site) => ({ site, ...computeScore(site, month, submissions, actions, today) }))
        .sort((a, b) => a.site.name.localeCompare(b.site.name)),
    [sites, submissions, actions, month, today]
  );

  const scored = rows.filter((r) => r.tier !== "not-audited");
  const completed = scored.length;
  const average =
    scored.length > 0 ? Math.round((scored.reduce((sum, r) => sum + (TIER_META[r.tier].score || 0), 0) / scored.length) * 10) / 10 : null;
  const redCount = rows.filter((r) => r.tier === "red").length;

  return (
    <div>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 16, fontSize: 13 }}>
        One score per showroom for the selected month, based on how many issues that site's walkaround(s) raised to the Actions
        Tracker that month.
      </p>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center" }}>
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
          />
        </label>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <KpiCard label="Showrooms completed this month" value={`${completed} / ${sites.length}`} />
          <KpiCard label="Estate average Level of Concern" value={average === null ? "-" : average} />
          <KpiCard label="Showrooms at RED" value={redCount} />
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: "6px 4px" }}>Showroom</th>
            <th>Issues this month</th>
            <th>Level of Concern</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = TIER_META[r.tier];
            let why = "";
            if (r.tier === "not-audited") why = "No H&S walkaround submitted for this month yet.";
            else if (r.tier === "red" && r.urgent) why = "Urgent safety concern raised this month.";
            else if (r.tier === "red" && r.stale) why = "Has an action open/in progress for more than 30 days.";
            else if (r.tier === "amber-dark") why = `${r.issueCount} issues raised this month.`;
            else if (r.tier === "amber") why = `${r.issueCount} issue${r.issueCount === 1 ? "" : "s"} raised this month.`;
            else if (r.tier === "green") why = "No issues raised this month.";
            return (
              <tr key={r.site.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                <td style={{ padding: "8px 4px" }}>{r.site.name}</td>
                <td>{r.tier === "not-audited" ? "-" : r.issueCount}</td>
                <td>
                  <span
                    style={{
                      background: meta.bg,
                      color: meta.fg,
                      borderRadius: 4,
                      padding: "2px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "inline-block",
                    }}
                  >
                    {meta.label}
                  </span>
                </td>
                <td style={{ color: "#6E6E6E", fontSize: 13 }}>{why}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: "16px 4px", color: "#999" }}>
                No H&S sites found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
