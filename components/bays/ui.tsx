// Shared look for the bay register pages (Round 28) - same inline-style
// approach and palette as the rest of the hub.
import type { CSSProperties, ReactNode } from "react";

export const PINK = "#E6017E";

export const card: CSSProperties = { background: "#fff", border: "1px solid #E6E6E6", borderRadius: 10, padding: 16 };
export const btn: CSSProperties = { background: PINK, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-block" };
export const btnQuiet: CSSProperties = { ...btn, background: "#fff", color: "#1D1C1D", border: "1px solid #CFCFCF" };
export const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #CFCFCF", borderRadius: 8, fontSize: 15, fontFamily: "inherit" };
export const muted: CSSProperties = { color: "#6E6E6E", fontSize: 13 };

const STATUS: Record<string, { bg: string; fg: string }> = {
  Verified: { bg: "#E5F4E4", fg: "#1E6B1C" },
  Installed: { bg: "#E7F1FB", fg: "#23548A" },
  Ordered: { bg: "#F9EEDA", fg: "#8A5A00" },
  Planned: { bg: "#EFEFEF", fg: "#555" },
  Removed: { bg: "#FBEBEB", fg: "#9B2C2C" },
  "With store": { bg: "#F9EEDA", fg: "#8A5A00" },
  "Awaiting Ryan": { bg: "#FFE6F3", fg: "#B0005F" },
  Rejected: { bg: "#FBEBEB", fg: "#9B2C2C" },
  Cancelled: { bg: "#EFEFEF", fg: "#555" },
  Overdue: { bg: "#FBEBEB", fg: "#9B2C2C" },
};

export function Pill({ children }: { children: string }) {
  const c = STATUS[children] || { bg: "#EFEFEF", fg: "#555" };
  return (
    <span style={{ display: "inline-block", background: c.bg, color: c.fg, fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function money(v: number | null | undefined, currency: "GBP" | "EUR") {
  if (v == null) return "—";
  return (currency === "EUR" ? "€" : "£") + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function dateText(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
