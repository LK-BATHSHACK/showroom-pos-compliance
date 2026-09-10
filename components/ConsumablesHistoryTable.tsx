import { Card } from "@/components/ui";

type Line = { id: string; itemName: string; quantity: number; notes: string | null };
type Row = { id: string; dateRequested: string; status: string; notes: string | null; lines: Line[] };

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Requested: { bg: "#FFEBB0", fg: "#966400" },
  Ordered: { bg: "#E8EEFF", fg: "#3348B0" },
  Fulfilled: { bg: "#DFF5DF", fg: "#1E7A1E" },
};

// Read-only history for a Store Manager's own site - no filters, no status
// editing (that's ConsumablesDashboard, for Admin/Marketing/Operations).
export default function ConsumablesHistoryTable({ rows }: { rows: Row[] }) {
  return (
    <Card title={`Your requests (${rows.length})`}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: "8px 6px" }}>Date</th>
            <th>Items</th>
            <th>Note</th>
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
                <td style={{ color: "#6E6E6E", fontSize: 13 }}>{r.notes || "-"}</td>
                <td>
                  <span style={{ background: style.bg, color: style.fg, fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999 }}>
                    {r.status}
                  </span>
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
