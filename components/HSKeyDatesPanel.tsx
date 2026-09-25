import Link from "next/link";
import { Card } from "@/components/ui";
import { dateStatus, DUE_SOON_DAYS, type DateStatus } from "@/lib/hsIssueChecks";

// Every showroom's key H&S dates in one table, taken from each site's most
// recent H&S check (Lorraine, 25 Sep 2026: "Is there anywhere that the dates
// of the next fire drill and next fire ex service can appear ... If not I
// will be clicking into every form anyway").

export type KeyDatesRow = {
  siteId: string;
  siteName: string;
  latestSubmissionId: string | null;
  latestSubmissionDate: string | null;
  extinguisherService: string | null; // Q38
  nextFireDrill: string | null; // Q67
  firstAidKitExpiry: string | null; // Q47
};

const STYLE: Record<DateStatus, { bg: string; fg: string }> = {
  overdue: { bg: "#FDE2E2", fg: "#B42318" },
  soon: { bg: "#FFF4E0", fg: "#966400" },
  ok: { bg: "#DFF5DF", fg: "#1E7A1E" },
  unknown: { bg: "#F2F2F2", fg: "#6E6E6E" },
};

function fmt(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function DateCell({ value, today, pastWord }: { value: string | null; today: string; pastWord: string }) {
  const { status, days } = dateStatus(value, today);
  const s = STYLE[status];
  if (status === "unknown") {
    return <td style={{ color: "#999", fontSize: 13 }}>{value ? value : "Not recorded"}</td>;
  }
  const note =
    status === "overdue"
      ? `${pastWord} ${Math.abs(days!)} day${Math.abs(days!) === 1 ? "" : "s"} ago`
      : days === 0
        ? "due today"
        : `in ${days} day${days === 1 ? "" : "s"}`;
  return (
    <td>
      <span style={{ background: s.bg, color: s.fg, fontWeight: 600, fontSize: 13, padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{fmt(value!)}</span>
      <div style={{ fontSize: 11, color: status === "ok" ? "#999" : s.fg, marginTop: 3 }}>{note}</div>
    </td>
  );
}

function worstRank(r: KeyDatesRow, today: string): number {
  const ranks = [r.extinguisherService, r.nextFireDrill, r.firstAidKitExpiry].map((d) => {
    const st = dateStatus(d, today).status;
    return st === "overdue" ? 0 : st === "soon" ? 1 : st === "unknown" ? 2 : 3;
  });
  return Math.min(...ranks);
}

export default function HSKeyDatesPanel({ rows, today }: { rows: KeyDatesRow[]; today: string }) {
  const sorted = rows.slice().sort((a, b) => worstRank(a, today) - worstRank(b, today) || a.siteName.localeCompare(b.siteName));
  const overdueCount = rows.filter((r) => worstRank(r, today) === 0).length;
  return (
    <Card title="Key dates by showroom">
      <p style={{ color: "#6E6E6E", fontSize: 13, marginTop: 0 }}>
        From each site's latest H&S check. <span style={{ color: STYLE.overdue.fg, fontWeight: 600 }}>Red</span> = passed,{" "}
        <span style={{ color: STYLE.soon.fg, fontWeight: 600 }}>amber</span> = due within {DUE_SOON_DAYS} days. Sites with something overdue are listed first
        {overdueCount ? ` (${overdueCount} right now)` : ""}. Dates only update when the site submits its next check.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Site</th>
              <th>Fire extinguisher service (Q38)</th>
              <th>Next fire drill (Q67)</th>
              <th>First aid kit expiry (Q47)</th>
              <th>From check</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.siteId} style={{ borderBottom: "1px solid #f2f2f2", verticalAlign: "top" }}>
                <td style={{ padding: "10px 6px", fontWeight: 500 }}>{r.siteName}</td>
                {r.latestSubmissionId ? (
                  <>
                    <DateCell value={r.extinguisherService} today={today} pastWord="overdue" />
                    <DateCell value={r.nextFireDrill} today={today} pastWord="overdue" />
                    <DateCell value={r.firstAidKitExpiry} today={today} pastWord="expired" />
                    <td style={{ fontSize: 13 }}>
                      <Link href={`/hs-review/${r.latestSubmissionId}`} style={{ color: "#3348B0" }}>
                        {r.latestSubmissionDate}
                      </Link>
                    </td>
                  </>
                ) : (
                  <td colSpan={4} style={{ color: "#999", fontSize: 13 }}>No H&S check submitted yet</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
