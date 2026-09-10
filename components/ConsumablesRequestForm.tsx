"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

type SiteOption = { id: string; name: string };
type CatalogItem = { id: string; name: string; category: string | null; unit: string | null };
type Line = { itemId: string; quantity: string; notes: string };

const EMPTY_LINE: Line = { itemId: "", quantity: "1", notes: "" };

export default function ConsumablesRequestForm({
  sites,
  lockedSite,
  catalog,
}: {
  sites: SiteOption[];
  lockedSite: SiteOption | null;
  catalog: CatalogItem[];
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(lockedSite?.id || "");
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  }
  function removeLine(i: number) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    const cleanLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
    if (!siteId) {
      setError("Pick a site.");
      return;
    }
    if (cleanLines.length === 0) {
      setError("Add at least one item with a quantity.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/consumables-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        notes,
        lines: cleanLines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), notes: l.notes })),
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setLines([{ ...EMPTY_LINE }]);
      setNotes("");
      setSuccess(true);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong.");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 14,
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" };

  return (
    <Card title="Submit a request">
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Site</label>
          {lockedSite ? (
            <div style={{ fontSize: 14, padding: "8px 0" }}>{lockedSite.name}</div>
          ) : (
            <select style={inputStyle} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Select a site...</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <label style={labelStyle}>Items</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {lines.map((line, i) => {
            const item = catalog.find((c) => c.id === line.itemId);
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  style={{ ...inputStyle, flex: "2 1 200px" }}
                  value={line.itemId}
                  onChange={(e) => updateLine(i, { itemId: e.target.value })}
                >
                  <option value="">Select an item...</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.category ? `${c.category} - ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  style={{ ...inputStyle, flex: "0 1 90px" }}
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  placeholder="Qty"
                />
                <span style={{ fontSize: 12, color: "#999", minWidth: 40 }}>{item?.unit || ""}</span>
                <input
                  style={{ ...inputStyle, flex: "1 1 160px" }}
                  value={line.notes}
                  onChange={(e) => updateLine(i, { notes: e.target.value })}
                  placeholder="Note (optional)"
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    style={{ background: "none", border: "none", color: "#d03b3b", cursor: "pointer", fontSize: 13 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addLine}
          style={{ background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer", marginBottom: 16 }}
        >
          + Add another item
        </button>

        <label style={labelStyle}>Anything else Chris should know? (optional)</label>
        <textarea
          style={{ ...inputStyle, minHeight: 60, marginBottom: 14 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. urgent, completely out"
        />

        {error && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        {success && <div style={{ color: "#0ca30c", fontSize: 13, marginBottom: 10 }}>Request submitted - Chris has been emailed.</div>}

        <button
          type="submit"
          disabled={submitting}
          style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </Card>
  );
}
