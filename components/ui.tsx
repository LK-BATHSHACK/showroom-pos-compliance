export const RAG_COLORS: Record<string, string> = {
  Green: "#0ca30c",
  Amber: "#fab219",
  Red: "#d03b3b",
};

export function RagBadge({ rag }: { rag?: string }) {
  const color = RAG_COLORS[rag || ""] || "#999";
  return (
    <span
      style={{
        display: "inline-block",
        background: color,
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 10px",
        borderRadius: 999,
      }}
    >
      {rag || "No data"}
    </span>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#d03b3b",
  High: "#e8622c",
  Medium: "#fab219",
  Low: "#8a8a8a",
};

export function PriorityBadge({ priority }: { priority?: string }) {
  const color = PRIORITY_COLORS[priority || ""] || "#999";
  return (
    <span style={{ color, fontWeight: 600, fontSize: 13 }}>
      {priority || "-"}
    </span>
  );
}

export function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, color: "#6E6E6E", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#1D1C1D" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {title && <h3 style={{ marginTop: 0, fontSize: 16 }}>{title}</h3>}
      {children}
    </div>
  );
}
