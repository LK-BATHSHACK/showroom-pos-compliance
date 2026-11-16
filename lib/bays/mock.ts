// PREVIEW_MODE-only seed for the bay register. Every product, code and price
// here is made up (DEMO- codes) - no real Bathshack data in the repo. Uses the
// preview Sites from lib/mockData.ts (Boucher = NI/GBP, Dublin = ROI/EUR).

import { fetchSites } from "@/lib/hsSubmission";
import type { Row } from "./db";

export async function seedPreviewBays(): Promise<Record<string, Row[]>> {
  const sites = await fetchSites();
  const boucher = sites.find((s) => s.name === "Boucher");
  const dublin = sites.find((s) => s.name === "Dublin Showroom");
  const id = () => crypto.randomUUID();
  const now = new Date();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  const date = (daysFromNow: number) => new Date(now.getTime() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

  const products = [
    ["DEMO-TILE-6012", "Demo Grey Stone 60 x 120 Matt Porcelain Tile - 1.44sqm per box", "m2", 1.44],
    ["DEMO-TILE-3090", "Demo White Gloss 30 x 90 Wall Tile - 1.35sqm per box", "m2", 1.35],
    ["DEMO-VAN-800O", "Demo 800mm Wall Hung Vanity Unit - Oak", "each", null],
    ["DEMO-VAN-1200O", "Demo 1200mm Floorstanding Vanity Unit - Oak", "each", null],
    ["DEMO-BAS-360B", "Demo 360mm Countertop Basin - Matt Black", "each", null],
    ["DEMO-TAP-TALLB", "Demo Tall Basin Mixer - Matt Black", "each", null],
    ["DEMO-TAP-BRASS", "Demo Basin Mixer - Brushed Brass", "each", null],
    ["DEMO-MIR-800LED", "Demo 800 x 600mm LED Mirror", "each", null],
    ["DEMO-MIR-600RND", "Demo 600mm Round Backlit Mirror - Brushed Brass", "each", null],
    ["DEMO-WC-RIMLESS", "Demo Rimless Back to Wall Toilet & Soft Close Seat", "each", null],
    ["DEMO-RAD-1800B", "Demo 1800 x 375mm Designer Radiator - Matt Black", "each", null],
    ["DEMO-BATH-1700", "Demo 1700mm Freestanding Bath", "each", null],
    ["DEMO-WASTE-CHR", "Demo Push Button Basin Waste - Chrome", "each", null],
  ].map(([sku, description, unit, m2]) => ({ sku, description, item_status: "Active", item_class: null, price_unit: unit, m2_per_box: m2, last_synced_at: iso(0) }));
  const gbp: Record<string, number> = {
    "DEMO-TILE-6012": 34.95, "DEMO-TILE-3090": 27.95, "DEMO-VAN-800O": 449.95, "DEMO-VAN-1200O": 699.95, "DEMO-BAS-360B": 129.95,
    "DEMO-TAP-TALLB": 89.95, "DEMO-TAP-BRASS": 119.95, "DEMO-MIR-800LED": 199.95, "DEMO-MIR-600RND": 249.95, "DEMO-WC-RIMLESS": 329.95,
    "DEMO-RAD-1800B": 289.95, "DEMO-BATH-1700": 899.95, "DEMO-WASTE-CHR": 19.95,
  };
  const prices = Object.entries(gbp).flatMap(([sku, p]) => [
    { sku, currency: "GBP", regular_inc_vat: p, promo_inc_vat: sku === "DEMO-BATH-1700" ? 749.95 : null, promo_start: sku === "DEMO-BATH-1700" ? date(-5) : null, promo_end: sku === "DEMO-BATH-1700" ? date(20) : null },
    { sku, currency: "EUR", regular_inc_vat: Math.round(p * 1.2) - 0.05, promo_inc_vat: null, promo_start: null, promo_end: null },
  ]);

  const stores: Row[] = [];
  const bays: Row[] = [];
  const lines: Row[] = [];
  const changes: Row[] = [];
  const items: Row[] = [];
  const exceptions: Row[] = [];
  const events: Row[] = [];

  function addStore(site: { id: string; name: string } | undefined, code: string, region: string, currency: string, layouts: string[][]) {
    if (!site) return;
    stores.push({ airtable_site_id: site.id, code, name: site.name, region, currency, active: true, created_at: iso(30) });
    layouts.forEach((skus, i) => {
      const bayId = id();
      const verified = i % 3 !== 2;
      bays.push({ id: bayId, store_id: site.id, bay_code: `${code}-${String(i + 1).padStart(2, "0")}`, label: String(i + 1), acumatica_quote_nbr: null, status: "Active", last_verified_at: verified ? iso(10 + i) : null, last_verified_by: verified ? "Preview Store Manager" : null, main_photo_id: null, created_at: iso(30) });
      skus.forEach((sku, k) => lines.push({ id: id(), bay_id: bayId, line_type: "Product", sku, text: null, qty: 1, sort: k, status: verified ? "Verified" : "Planned", source: "Import", change_id: null, installed_at: null, verified_at: verified ? iso(10 + i) : null, removed_at: null, created_at: iso(30) }));
      if (i === 0) lines.push({ id: id(), bay_id: bayId, line_type: "Prop", sku: null, text: "Potted olive tree (styling)", qty: 1, sort: 99, status: verified ? "Verified" : "Planned", source: "Import", change_id: null, created_at: iso(30) });
      events.push({ id: events.length + 1, entity: "bay", entity_id: bayId, action: "Imported from bay sheet", actor: "Preview Admin", at: iso(30), detail: null });
    });
  }
  const layouts = [
    ["DEMO-TILE-6012", "DEMO-VAN-800O", "DEMO-BAS-360B", "DEMO-TAP-TALLB", "DEMO-MIR-800LED", "DEMO-WC-RIMLESS"],
    ["DEMO-TILE-3090", "DEMO-VAN-1200O", "DEMO-TAP-BRASS", "DEMO-MIR-600RND", "DEMO-RAD-1800B"],
    ["DEMO-TILE-6012", "DEMO-BATH-1700", "DEMO-TAP-BRASS", "DEMO-RAD-1800B"],
    ["DEMO-TILE-3090", "DEMO-VAN-800O", "DEMO-WASTE-CHR", "DEMO-MIR-800LED"],
  ];
  addStore(boucher, "BOU", "NI", "GBP", layouts);
  addStore(dublin, "DUB", "ROI", "EUR", layouts.slice(0, 3));

  // One change waiting for the Boucher store to install (Ryan swapped a mirror).
  const bay1 = bays.find((b) => b.bay_code === "BOU-01");
  const oldMirror = bay1 && lines.find((l) => l.bay_id === bay1.id && l.sku === "DEMO-MIR-800LED");
  if (bay1 && oldMirror) {
    const cid = id();
    changes.push({ id: cid, bay_id: bay1.id, raised_by: "Preview Layout Lead", raised_by_role: "Layout Lead", status: "With store", note: "Swap to the round brass mirror to match the tap.", needs_order: true, decided_by: null, decided_at: null, decision_note: null, installed_by: null, installed_at: null, due_at: date(5), created_at: iso(2) });
    items.push({ id: id(), change_id: cid, action: "Replace", old_line_id: oldMirror.id, new_sku: "DEMO-MIR-600RND", new_text: null, qty: 1, seen_on_quote_at: null });
    lines.push({ id: id(), bay_id: bay1.id, line_type: "Product", sku: "DEMO-MIR-600RND", text: null, qty: 1, sort: 7, status: "Planned", source: "Change", change_id: cid, created_at: iso(2) });
  }
  const bay2 = bays.find((b) => b.bay_code === "BOU-02");
  if (bay2) exceptions.push({ id: id(), kind: "On display but not in register", store_id: bay2.store_id, bay_id: bay2.id, bay_line_id: null, detail: "DEMO-WASTE-CHR: found on the last check", owner_role: "Layout Lead", status: "Open", opened_at: iso(4), resolved_at: null, resolved_by: null, resolution_note: null });

  return {
    bay_stores: stores, bays, products, prices, bay_lines: lines, photos: [], photo_tags: [], change_requests: changes, change_items: items,
    verifications: [], verification_items: [], exceptions, reprint_tasks: [], bay_events: events, sync_runs: [], bay_settings: [],
  };
}
