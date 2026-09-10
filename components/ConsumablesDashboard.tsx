"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, KpiCard } from "@/components/ui";

type Line = { id: string; itemId: string | null; itemName: string; quantity: number; notes: string | null };
type Row = {
  id: string;
  siteId: string | null;
  siteName: string;
  requestedByName: string;
  requestedByEmail: string;
  dateRequested: string;
  status: string;
  statusUpdatedDate: string | null;
  statusUpdatedByName: string | null;
  notes: string | null;
  lines: Line[];
};
type CatalogItem = { id: string; name: string; category: string | null; unit: string | null; active: boolean };

const STATUSES = ["Requested", "Ordered", "Fulfilled"];
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Requested: { bg: "#FFEBB0", fg: "#966400" },
  Ordered: { bg: "#E8EEFF", fg: "#3348B0" },
  Fulfilled: { bg: "#DFF5DF", fg: "#1E7A1E" },
};

// Mirrors the live Category field's choices (lib/consumables.ts's
// CONSUMABLE_CATEGORIES) - kept as a small local copy rather than importing
// server-only code into this client component.
const CATEGORIES = ["Toilet & Washroom", "Stationery & Printing", "Cash Office", "Cleaning & Hygiene", "Other"];

export default function ConsumablesDashboard({
  rows,
  catalog,
  canManageStatus,
  canManageCatalog,
}: {
  rows: Row[];
  catalog: CatalogItem[];
  canManageStatus: boolean;
  canManageCatalog: boolean;
}) {
  const router = useRouter();
  const [site, setSite] = useState("");
  const [item, setItem] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // "Add item" (Lorraine, 10 Sep 2026: "allow admin to add in more when
  // needed with an add button") - Admin-only, see app/api/consumable-items.
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState(CATEGORIES[0]);
  const [newItemUnit, setNewItemUnit] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState("");

  const sites = useMemo(() => Array.from(new Set(rows.map((r) => r.siteName))).sort(), [rows]);
  const items = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.lines.map((l) => l.itemName)))).sort(),
    [rows]
  );

  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (site && r.siteName !== site) return false;
      if (status && r.status !== status) return false;
      if (item && !r.lines.some((l) => l.itemName === item)) return false;
      if (from && r.dateRequested < from) return false;
      if (to && r.dateRequested > to) return false;
      return true;
    });
  }, [rows, site, item, status, from, to]);

  // "Checking patterns" (Lorraine, 10 Sep 2026): totals by item and by site
  // across whatever's currently filtered, so these react to the same
  // filters as the table below rather than always being all-time.
  const patterns = useMemo(() => {
    const byItem = new Map<string, { count: number; qty: number }>();
    const bySite = new Map<string, number>();
    visible.forEach((r) => {
      bySite.set(r.siteName, (bySite.get(r.siteName) || 0) + 1);
      r.lines.forEach((l) => {
        const cur = byItem.get(l.itemName) || { count: 0, qty: 0 };
        cur.count += 1;
        cur.qty += l.quantity;
        byItem.set(l.itemName, cur);
      });
    });
    const topItems = Array.from(byItem.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
    const topSites = Array.from(bySite.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return { topItems, topSites };
  }, [visible]);

  const openCount = visible.filter((r) => r.status !== "Fulfilled").length;
  const topItemLabel = patterns.topItems[0] ? `${patterns.topItems[0].name} (${patterns.topItems[0].qty})` : "-";
  const topSiteLabel = patterns.topSites[0] ? `${patterns.topSites[0].name} (${patterns.topSites[0].count})` : "-";

  async function changeStatus(id: string, newStatus: string) {
    setSavingId(id);
    await fetch(`/api/consumables-request/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setSavingId(null);
    router.refresh();
  }

  async function saveNewItem() {
    if (!newItemName.trim()) {
      setItemError("Give the item a name.");
      return;
    }
    setSavingItem(true);
    setItemError("");
    const res = await fetch("/api/consumable-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newItemName.trim(), category: newItemCategory, unit: newItemUnit.trim() }),
    });
    const body = await res.json().catch(() => ({}));
    setSavingItem(false);
    if (res.ok) {
      setNewItemName("");
      setNewItemUnit("");
      setNewItemCategory(CATEGORIES[0]);
      setAddingItem(false);
      router.refresh();
    } else {
      setItemError(body.error || "Couldn't add that item - try again.");
    }
  }

  const selectStyle: React.CSSProperties = { padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13 };

  return (
    <div>
      {/* "Manage catalog" (Lorraine, 10 Sep 2026: "allow admin to add in more
          when needed with an add button") - Admin only, so a new item can be
          added straight from here without needing Airtable access. */}
      {canManageCatalog && (
        <Card title="Consumables catalog">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginBottom: 12, fontSize: 13, color: "#333" }}>
            {catalog.map((c) => (
              <span key={c.id}>
                {c.name}
                {c.unit ? <span style={{ color: "#999" }}> ({c.unit})</span> : null}
              </span>
            ))}
            {catalog.length === 0 && <span style={{ color: "#999" }}>No items in the catalog yet.</span>}
          </div>
          {!addingItem ? (
            <button
              onClick={() => setAddingItem(true)}
              style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
            >
              + Add item
            </button>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Item name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                style={{ ...selectStyle, minWidth: 180 }}
              />
              <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} style={selectStyle}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Unit (optional, e.g. rolls, boxes)"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                style={{ ...selectStyle, minWidth: 180 }}
              />
              <button
                disabled={savingItem}
                onClick={saveNewItem}
                style={{ background: "#0ca30c", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
              >
                Save
              </button>
              <button
                disabled={savingItem}
                onClick={() => {
                  setAddingItem(false);
                  setItemError("");
                  setNewItemName("");
                  setNewItemUnit("");
                }}
                style={{ background: "none", border: "1px solid #ccc", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              {itemError && <span style={{ color: "#d03b3b", fontSize: 12 }}>{itemError}</span>}
            </div>
          )}
        </Card>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20, marginTop: canManageCatalog ? 20 : 0 }}>
        <KpiCard label="Requests (filtered)" value={visible.length} />
        <KpiCard label="Not yet fulfilled" value={openCount} />
        <KpiCard label="Top item requested" value={topItemLabel} />
        <KpiCard label="Busiest site" value={topSiteLabel} />
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <Card title="Top items">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "4px 6px" }}>Item</th>
                <th>Requests</th>
                <th>Total qty</th>
              </tr>
            </thead>
            <tbody>
              {patterns.topItems.map((i) => (
                <tr key={i.name} style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "4px 6px" }}>{i.name}</td>
                  <td>{i.count}</td>
                  <td>{i.qty}</td>
                </tr>
              ))}
              {patterns.topItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "8px 6px", color: "#999" }}>
                    Nothing in this range yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card title="By store">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "4px 6px" }}>Store</th>
                <th>Requests</th>
              </tr>
            </thead>
            <tbody>
              {patterns.topSites.map((s) => (
                <tr key={s.name} style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "4px 6px" }}>{s.name}</td>
                  <td>{s.count}</td>
                </tr>
              ))}
              {patterns.topSites.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: "8px 6px", color: "#999" }}>
                    Nothing in this range yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={site} onChange={(e) => setSite(e.target.value)} style={selectStyle}>
          <option value="">All stores</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={item} onChange={(e) => setItem(e.target.value)} style={selectStyle}>
          <option value="">All items</option>
          {items.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center" }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={selectStyle} />
        </label>
        <label style={{ fontSize: 13, color: "#6E6E6E", display: "flex", gap: 6, alignItems: "center" }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={selectStyle} />
        </label>
        {(site || item || status || from || to) && (
          <button
            onClick={() => {
              setSite("");
              setItem("");
              setStatus("");
              setFrom("");
              setTo("");
            }}
            style={{ background: "none", border: "none", color: "#3348B0", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}
          >
            Clear filters
          </button>
        )}
      </div>

      <Card>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: "8px 6px" }}>Date</th>
              <th>Store</th>
              <th>Requested by</th>
              <th>Items</th>
              <th>Note</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const style = STATUS_STYLE[r.status] || STATUS_STYLE.Requested;
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #f2f2f2", verticalAlign: "top" }}>
                  <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{r.dateRequested}</td>
                  <td>{r.siteName}</td>
                  <td>{r.requestedByName}</td>
                  <td>
                    {r.lines.map((l) => (
                      <div key={l.id}>
                        {l.itemName} &times; {l.quantity}
                        {l.notes ? <span style={{ color: "#999" }}> - {l.notes}</span> : null}
                      </div>
                    ))}
                  </td>
                  <td style={{ color: "#6E6E6E", fontSize: 13 }}>{r.notes || "-"}</td>
                  <td>
                    {canManageStatus ? (
                      <select
                        value={r.status}
                        disabled={savingId === r.id}
                        onChange={(e) => changeStatus(r.id, e.target.value)}
                        style={{ ...selectStyle, background: style.bg, color: style.fg, fontWeight: 600, border: "none" }}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span
                        style={{ background: style.bg, color: style.fg, fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999 }}
                      >
                        {r.status}
                      </span>
                    )}
                    {r.statusUpdatedByName && (
                      <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>
                        by {r.statusUpdatedByName}
                        {r.statusUpdatedDate ? ` - ${r.statusUpdatedDate}` : ""}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "16px 6px", color: "#999" }}>
                  Nothing matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
