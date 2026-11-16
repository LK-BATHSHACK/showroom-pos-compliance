// Bay register business logic (Round 28). Pages and API routes call these;
// these call lib/bays/db.ts. Every write records an event in bay_events.

import { select, insert, update, uploadPhotoObject, signedPhotoUrl } from "./db";
import type {
  Bay, BayStore, BayLine, Product, Price, LineView, ChangeRequest, ChangeItem, BayException, Photo, ChangeAction,
} from "./types";
import type { SessionPayload } from "@/lib/auth-edge";

const DAY = 86_400_000;
export const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

/** Codes are always trimmed text with no hidden spaces - the bay-sheet clean-up showed Excel and copy/paste add both. */
export function cleanSku(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/ /g, " ").trim();
  return s || null;
}

export async function logEvent(entity: string, entityId: string, action: string, actor: string | null, detail?: unknown) {
  await insert("bay_events", [{ entity, entity_id: entityId, action, actor, detail: detail ?? null }]);
}

// ---------------- stores ----------------
export async function listStores(): Promise<BayStore[]> {
  return select<BayStore>("bay_stores", { eq: { active: true }, order: [{ col: "name" }] });
}

export async function getStore(id: string): Promise<BayStore | null> {
  return (await select<BayStore>("bay_stores", { eq: { airtable_site_id: id } }))[0] || null;
}

export async function setUpStore(site: { id: string; name: string; region: "NI" | "ROI" | "GB" }, code: string, actor: string) {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2,5}$/.test(c)) throw new BayError("Store code must be 2-5 letters, e.g. LUR.");
  if (await getStore(site.id)) throw new BayError("This store already uses the bay register.");
  if ((await select("bay_stores", { eq: { code: c } })).length) throw new BayError(`Code ${c} is already used by another store.`);
  await insert("bay_stores", [{ airtable_site_id: site.id, code: c, name: site.name, region: site.region, currency: site.region === "ROI" ? "EUR" : "GBP" }]);
  await logEvent("store", site.id, "Set up for bay register", actor, { code: c });
}

export async function addBays(storeId: string, labels: string[], actor: string) {
  const store = await getStore(storeId);
  if (!store) throw new BayError("Set the store up first.");
  const existing = new Set((await select<Bay>("bays", { eq: { store_id: storeId } })).map((b) => b.bay_code));
  const rows = labels
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => {
      const m = label.match(/^(\d+)\s*([a-zA-Z]?)$/);
      if (!m) throw new BayError(`"${label}" isn't a bay number (use 1, 2, 10a ...).`);
      return { label, bay_code: `${store.code}-${m[1].padStart(2, "0")}${m[2].toUpperCase()}` };
    })
    .filter((r) => !existing.has(r.bay_code))
    .map((r) => ({ store_id: storeId, bay_code: r.bay_code, label: r.label, status: "Active" }));
  const out = await insert<Bay>("bays", rows);
  for (const b of out) await logEvent("bay", b.id, "Bay created", actor);
  return out.length;
}

// ---------------- prices ----------------
/** "Now" = the promo price when today falls inside the promo dates, otherwise the regular price. "Was" only shows during a promo. */
export function priceView(p: Price | undefined, unit: "each" | "m2", currency: "GBP" | "EUR", today = todayIso()): LineView["price"] {
  if (!p || p.regular_inc_vat == null) return null;
  const promoOn = p.promo_inc_vat != null && (!p.promo_start || p.promo_start <= today) && (!p.promo_end || p.promo_end >= today);
  return promoOn
    ? { now: Number(p.promo_inc_vat), was: Number(p.regular_inc_vat), unit, currency }
    : { now: Number(p.regular_inc_vat), was: null, unit, currency };
}

async function joinLines(lines: BayLine[], currency: "GBP" | "EUR"): Promise<LineView[]> {
  const skus = Array.from(new Set(lines.map((l) => l.sku).filter(Boolean))) as string[];
  const [products, prices] = skus.length
    ? await Promise.all([
        select<Product>("products", { in: { col: "sku", values: skus } }),
        select<Price>("prices", { in: { col: "sku", values: skus }, eq: { currency } }),
      ])
    : [[], []];
  const pBy = new Map(products.map((p) => [p.sku, p]));
  const prBy = new Map(prices.map((p) => [p.sku, p]));
  return lines.map((l) => {
    const prod = l.sku ? pBy.get(l.sku) : undefined;
    return {
      ...l,
      description: prod?.description || l.text || (l.sku ? `${l.sku} (not in the product list yet)` : "Unknown item"),
      price: l.line_type === "Product" && l.sku ? priceView(prBy.get(l.sku), prod?.price_unit || "each", currency) : null,
      itemStatus: prod?.item_status || null,
    };
  });
}

// ---------------- bays ----------------
export type BaySummary = Bay & { photoUrl: string | null; lineCount: number; openChanges: number; unverified: number };

export async function listBays(storeId: string): Promise<BaySummary[]> {
  const bays = await select<Bay>("bays", { eq: { store_id: storeId, status: "Active" } });
  if (!bays.length) return [];
  const ids = bays.map((b) => b.id);
  const [lines, changes, photos] = await Promise.all([
    select<BayLine>("bay_lines", { in: { col: "bay_id", values: ids } }),
    select<ChangeRequest>("change_requests", { in: { col: "bay_id", values: ids } }),
    select<Photo>("photos", { in: { col: "id", values: bays.map((b) => b.main_photo_id).filter(Boolean) as string[] } }).catch(() => [] as Photo[]),
  ]);
  const photoPath = new Map(photos.map((p) => [p.id, p.storage_path]));
  const out = await Promise.all(
    bays.map(async (b) => {
      const ls = lines.filter((l) => l.bay_id === b.id && l.status !== "Removed");
      return {
        ...b,
        photoUrl: b.main_photo_id && photoPath.get(b.main_photo_id) ? await signedPhotoUrl(photoPath.get(b.main_photo_id)!) : null,
        lineCount: ls.filter((l) => l.line_type === "Product").length,
        unverified: ls.filter((l) => l.status !== "Verified").length,
        openChanges: changes.filter((c) => c.bay_id === b.id && (c.status === "With store" || c.status === "Awaiting Ryan")).length,
      };
    })
  );
  return out.sort((a, b) => a.bay_code.localeCompare(b.bay_code, undefined, { numeric: true }));
}

export type ChangeView = ChangeRequest & { items: (ChangeItem & { oldDescription: string | null; newDescription: string | null })[]; bay_code: string; store_id: string };

async function changeViews(changes: ChangeRequest[]): Promise<ChangeView[]> {
  if (!changes.length) return [];
  const [items, bays] = await Promise.all([
    select<ChangeItem>("change_items", { in: { col: "change_id", values: changes.map((c) => c.id) } }),
    select<Bay>("bays", { in: { col: "id", values: Array.from(new Set(changes.map((c) => c.bay_id))) } }),
  ]);
  const oldIds = items.map((i) => i.old_line_id).filter(Boolean) as string[];
  const newSkus = items.map((i) => i.new_sku).filter(Boolean) as string[];
  const [oldLines, prods] = await Promise.all([
    oldIds.length ? select<BayLine>("bay_lines", { in: { col: "id", values: oldIds } }) : Promise.resolve([] as BayLine[]),
    select<Product>("products", { in: { col: "sku", values: Array.from(new Set([...newSkus, "__none__"])) } }),
  ]);
  const oldSkus = oldLines.map((l) => l.sku).filter(Boolean) as string[];
  const oldProds = oldSkus.length ? await select<Product>("products", { in: { col: "sku", values: oldSkus } }) : [];
  const desc = (sku: string | null) => (sku ? [...prods, ...oldProds].find((p) => p.sku === sku)?.description || sku : null);
  return changes.map((c) => {
    const bay = bays.find((b) => b.id === c.bay_id)!;
    return {
      ...c,
      bay_code: bay?.bay_code || "?",
      store_id: bay?.store_id || "",
      items: items
        .filter((i) => i.change_id === c.id)
        .map((i) => {
          const old = oldLines.find((l) => l.id === i.old_line_id);
          return { ...i, oldDescription: old ? desc(old.sku) || old.text : null, newDescription: i.new_sku ? desc(i.new_sku) : i.new_text };
        }),
    };
  });
}

export async function getBay(code: string) {
  const bay = (await select<Bay>("bays", { eq: { bay_code: code.toUpperCase() } }))[0];
  if (!bay) return null;
  const store = await getStore(bay.store_id);
  if (!store) return null;
  const [lines, changes, exceptions, photos, events] = await Promise.all([
    select<BayLine>("bay_lines", { eq: { bay_id: bay.id }, order: [{ col: "sort" }, { col: "created_at" }] }),
    select<ChangeRequest>("change_requests", { eq: { bay_id: bay.id }, order: [{ col: "created_at", asc: false }] }),
    select<BayException>("exceptions", { eq: { bay_id: bay.id, status: "Open" } }),
    select<Photo>("photos", { eq: { bay_id: bay.id }, order: [{ col: "taken_at", asc: false }] }),
    select<{ action: string; actor: string | null; at: string }>("bay_events", { eq: { entity: "bay", entity_id: bay.id }, order: [{ col: "at", asc: false }], limit: 15 }),
  ]);
  const main = photos.find((p) => p.id === bay.main_photo_id) || photos[0];
  return {
    bay,
    store,
    lines: await joinLines(lines.filter((l) => l.status !== "Removed"), store.currency),
    openChanges: await changeViews(changes.filter((c) => c.status === "With store" || c.status === "Awaiting Ryan")),
    recentChanges: await changeViews(changes.filter((c) => !(c.status === "With store" || c.status === "Awaiting Ryan")).slice(0, 5)),
    exceptions,
    photoUrl: main ? await signedPhotoUrl(main.storage_path) : null,
    photoTakenAt: main?.taken_at || null,
    events,
  };
}

// ---------------- products ----------------
export async function searchProducts(q: string, limit = 12): Promise<Product[]> {
  if (q.trim().length < 2) return [];
  return select<Product>("products", { search: { cols: ["sku", "description"], q }, limit, order: [{ col: "sku" }] });
}

// ---------------- photos ----------------
export async function savePhoto(bay: Bay, store: BayStore, file: File, actor: string, verificationId?: string): Promise<Photo> {
  if (!file.type.startsWith("image/")) throw new BayError("The photo must be an image.");
  if (file.size > 4 * 1024 * 1024) throw new BayError("That photo is too large. Please try again (the app shrinks photos before sending).");
  const path = `${store.code}/${bay.bay_code}/${Date.now()}.jpg`;
  await uploadPhotoObject(path, await file.arrayBuffer(), file.type);
  const [photo] = await insert<Photo>("photos", [{ bay_id: bay.id, storage_path: path, taken_by: actor, verification_id: verificationId ?? null }]);
  await update("bays", { eq: { id: bay.id } }, { main_photo_id: photo.id });
  return photo;
}

// ---------------- change requests ----------------
export type NewChangeItem = { action: ChangeAction; oldLineId?: string | null; newSku?: string | null; qty?: number };

export async function createChange(
  bay: Bay,
  input: { items: NewChangeItem[]; note?: string; needsOrder: boolean },
  s: SessionPayload
): Promise<ChangeRequest> {
  if (!input.items.length) throw new BayError("Add at least one change.");
  const lines = await select<BayLine>("bay_lines", { eq: { bay_id: bay.id } });
  const items = input.items.map((i) => {
    const newSku = cleanSku(i.newSku);
    if ((i.action === "Add" || i.action === "Replace") && !newSku) throw new BayError("Pick the product being added.");
    if ((i.action === "Remove" || i.action === "Replace") && !lines.find((l) => l.id === i.oldLineId && l.status !== "Removed"))
      throw new BayError("Pick the product being removed from this bay.");
    return { ...i, newSku };
  });
  const storeRaised = s.role === "Store Manager";
  const [change] = await insert<ChangeRequest>("change_requests", [
    {
      bay_id: bay.id,
      raised_by: s.name,
      raised_by_role: s.role,
      status: storeRaised ? "Awaiting Ryan" : "With store",
      note: input.note?.trim() || null,
      needs_order: input.needsOrder,
      due_at: storeRaised ? null : addDays(7),
    },
  ]);
  await insert(
    "change_items",
    items.map((i) => ({ change_id: change.id, action: i.action, old_line_id: i.oldLineId || null, new_sku: i.newSku, qty: Math.max(1, i.qty || 1) }))
  );
  // New products show on the bay straight away as Planned, so everyone can see what's coming.
  const maxSort = Math.max(0, ...lines.map((l) => l.sort));
  await insert(
    "bay_lines",
    items
      .filter((i) => i.newSku)
      .map((i, k) => ({ bay_id: bay.id, line_type: "Product", sku: i.newSku, qty: Math.max(1, i.qty || 1), sort: maxSort + k + 1, status: "Planned", source: "Change", change_id: change.id }))
  );
  await logEvent("bay", bay.id, `Change raised (${items.map((i) => i.action).join(", ")})`, s.name, { change: change.id });
  return change;
}

export async function getChange(id: string): Promise<ChangeView | null> {
  const c = (await select<ChangeRequest>("change_requests", { eq: { id } }))[0];
  return c ? (await changeViews([c]))[0] : null;
}

export async function decideChange(change: ChangeView, approve: boolean, note: string, s: SessionPayload) {
  if (change.status !== "Awaiting Ryan") throw new BayError("This change has already been decided.");
  await update("change_requests", { eq: { id: change.id } }, {
    status: approve ? "With store" : "Rejected",
    decided_by: s.name,
    decided_at: new Date().toISOString(),
    decision_note: note.trim() || null,
    due_at: approve ? addDays(7) : null,
  });
  if (!approve) await update("bay_lines", { eq: { change_id: change.id, status: "Planned" } }, { status: "Removed", removed_at: new Date().toISOString() });
  await logEvent("bay", change.bay_id, approve ? "Store-raised change approved" : "Store-raised change rejected", s.name, { change: change.id, note });
}

export async function cancelChange(change: ChangeView, s: SessionPayload) {
  if (change.status !== "With store" && change.status !== "Awaiting Ryan") throw new BayError("Only an open change can be cancelled.");
  await update("change_requests", { eq: { id: change.id } }, { status: "Cancelled", decided_by: s.name, decided_at: new Date().toISOString() });
  await update("bay_lines", { eq: { change_id: change.id, status: "Planned" } }, { status: "Removed", removed_at: new Date().toISOString() });
  await logEvent("bay", change.bay_id, "Change cancelled", s.name, { change: change.id });
}

/** Store confirms a change is installed, with a new bay photo. New lines become Verified; removed/replaced lines become Removed. */
export async function installChange(change: ChangeView, photo: File, s: SessionPayload) {
  if (change.status !== "With store") throw new BayError(change.status === "Awaiting Ryan" ? "Ryan needs to approve this change first." : "This change is already closed.");
  const bay = (await select<Bay>("bays", { eq: { id: change.bay_id } }))[0];
  const store = (await getStore(bay.store_id))!;
  const now = new Date().toISOString();
  const p = await savePhoto(bay, store, photo, s.name);
  const removeIds = change.items.map((i) => i.old_line_id).filter(Boolean) as string[];
  if (removeIds.length) await update("bay_lines", { in: { col: "id", values: removeIds } }, { status: "Removed", removed_at: now });
  await update("bay_lines", { eq: { change_id: change.id } }, { status: "Verified", installed_at: now, verified_at: now });
  await update("change_requests", { eq: { id: change.id } }, { status: "Verified", installed_by: s.name, installed_at: now, install_photo_id: p.id });
  await update("bays", { eq: { id: bay.id } }, { last_verified_at: now, last_verified_by: s.name });
  await insert("reprint_tasks", [{ store_id: store.airtable_site_id, bay_id: bay.id, reason: "Bay change" }]);
  await logEvent("bay", bay.id, "Change installed and photographed", s.name, { change: change.id });
}

// ---------------- checks ----------------
export type CheckResult = { lineId: string; result: "Present" | "Missing" | "Different"; note?: string };

export async function checkBay(
  bay: Bay,
  input: { results: CheckResult[]; added: { sku?: string | null; text?: string | null }[]; kind: "Capture" | "Monthly" },
  photo: File,
  s: SessionPayload
) {
  const store = (await getStore(bay.store_id))!;
  const lines = (await select<BayLine>("bay_lines", { eq: { bay_id: bay.id } })).filter((l) => l.status !== "Removed" && !isIncoming(l));
  const byId = new Map(input.results.map((r) => [r.lineId, r]));
  const missing = lines.filter((l) => !byId.has(l.id));
  if (missing.length) throw new BayError("Please tick every line before submitting.");
  const added = input.added.map((a) => ({ sku: cleanSku(a.sku), text: a.text?.trim() || null })).filter((a) => a.sku || a.text);
  const differences = input.results.filter((r) => r.result !== "Present").length + added.length;
  const now = new Date().toISOString();
  const [v] = await insert<{ id: string }>("verifications", [{ bay_id: bay.id, kind: input.kind, by_name: s.name, result: differences ? "Differences" : "Matches" }]);
  const p = await savePhoto(bay, store, photo, s.name, v.id);
  await update("verifications", { eq: { id: v.id } }, { photo_id: p.id });
  await insert("verification_items", [
    ...input.results.map((r) => ({ verification_id: v.id, bay_line_id: r.lineId, result: r.result, note: r.note?.trim() || null })),
    ...added.map((a) => ({ verification_id: v.id, result: "Added", found_sku: a.sku, note: a.text })),
  ]);
  const presentIds = input.results.filter((r) => r.result === "Present").map((r) => r.lineId);
  if (presentIds.length) await update("bay_lines", { in: { col: "id", values: presentIds } }, { status: "Verified", verified_at: now });
  // Differences are never applied silently: each one goes to Ryan's desk.
  const exc = [
    ...input.results
      .filter((r) => r.result !== "Present")
      .map((r) => {
        const l = lines.find((x) => x.id === r.lineId)!;
        return {
          kind: r.result === "Missing" ? "Missing from bay" : "Different product on display",
          store_id: store.airtable_site_id,
          bay_id: bay.id,
          bay_line_id: l.id,
          detail: `${l.sku || l.text || "Line"}${r.note ? `: ${r.note.trim()}` : ""}`,
        };
      }),
    ...added.map((a) => ({
      kind: a.sku ? "On display but not in register" : "Unknown item on display",
      store_id: store.airtable_site_id,
      bay_id: bay.id,
      detail: [a.sku, a.text].filter(Boolean).join(": "),
    })),
  ];
  await insert("exceptions", exc);
  await update("bays", { eq: { id: bay.id } }, { last_verified_at: now, last_verified_by: s.name });
  await logEvent("bay", bay.id, differences ? `Checked: ${differences} difference(s) sent to Ryan` : "Checked: matches", s.name, { verification: v.id });
  return { differences };
}

// ---------------- desk ----------------
export async function deskData() {
  const [awaiting, withStore, exceptions, stores] = await Promise.all([
    select<ChangeRequest>("change_requests", { eq: { status: "Awaiting Ryan" }, order: [{ col: "created_at" }] }),
    select<ChangeRequest>("change_requests", { eq: { status: "With store" }, order: [{ col: "due_at" }] }),
    select<BayException>("exceptions", { eq: { status: "Open" }, order: [{ col: "opened_at" }] }),
    listStores(),
  ]);
  const today = todayIso();
  const bayIds = Array.from(new Set(exceptions.map((e) => e.bay_id).filter(Boolean) as string[]));
  const bays = bayIds.length ? await select<Bay>("bays", { in: { col: "id", values: bayIds } }) : [];
  return {
    awaiting: await changeViews(awaiting),
    overdue: await changeViews(withStore.filter((c) => c.due_at && c.due_at < today)),
    inProgress: await changeViews(withStore.filter((c) => !c.due_at || c.due_at >= today)),
    exceptions: exceptions.map((e) => ({ ...e, bay_code: bays.find((b) => b.id === e.bay_id)?.bay_code || null })),
    storeName: (id: string) => stores.find((st) => st.airtable_site_id === id)?.name || "",
  };
}

export async function resolveException(id: string, note: string, dismiss: boolean, s: SessionPayload) {
  const e = (await select<BayException>("exceptions", { eq: { id } }))[0];
  if (!e || e.status !== "Open") throw new BayError("This item is already closed.");
  await update("exceptions", { eq: { id } }, { status: dismiss ? "Dismissed" : "Resolved", resolved_at: new Date().toISOString(), resolved_by: s.name, resolution_note: note.trim() || null });
  if (e.bay_id) await logEvent("bay", e.bay_id, `${dismiss ? "Dismissed" : "Resolved"}: ${e.kind}`, s.name, { note });
}

/** Changes the store still has to install - the store's to-do list. */
export async function storeTodo(storeId: string) {
  const bays = await select<Bay>("bays", { eq: { store_id: storeId } });
  if (!bays.length) return [];
  const open = await select<ChangeRequest>("change_requests", { in: { col: "bay_id", values: bays.map((b) => b.id) }, eq: { status: "With store" }, order: [{ col: "due_at" }] });
  return changeViews(open);
}

// ---------------- locator ----------------
export type LocatorHit = { product: Product; places: { store: BayStore; bay: Bay; status: string; photoUrl: string | null }[] };

export async function locate(q: string, allowedStore?: string | null): Promise<LocatorHit[]> {
  const products = await searchProducts(q, 25);
  if (!products.length) return [];
  const lines = (await select<BayLine>("bay_lines", { in: { col: "sku", values: products.map((p) => p.sku) } })).filter((l) => l.status !== "Removed");
  if (!lines.length) return products.map((p) => ({ product: p, places: [] })).slice(0, 10);
  const [bays, stores] = await Promise.all([
    select<Bay>("bays", { in: { col: "id", values: Array.from(new Set(lines.map((l) => l.bay_id))) } }),
    listStores(),
  ]);
  const photoIds = bays.map((b) => b.main_photo_id).filter(Boolean) as string[];
  const photos = photoIds.length ? await select<Photo>("photos", { in: { col: "id", values: photoIds } }) : [];
  const hits: LocatorHit[] = [];
  for (const p of products) {
    const places = [];
    for (const l of lines.filter((x) => x.sku === p.sku)) {
      const bay = bays.find((b) => b.id === l.bay_id);
      const store = bay && stores.find((st) => st.airtable_site_id === bay.store_id);
      if (!bay || !store || bay.status !== "Active") continue;
      if (allowedStore && store.airtable_site_id !== allowedStore) continue;
      const ph = photos.find((x) => x.id === bay.main_photo_id);
      places.push({ store, bay, status: l.status, photoUrl: ph ? await signedPhotoUrl(ph.storage_path) : null });
    }
    hits.push({ product: p, places });
  }
  return hits.sort((a, b) => b.places.length - a.places.length);
}

/** A line added by a change that hasn't been installed yet - not on display, so not checked or changed. */
export function isIncoming(l: { status: string; source: string }) {
  return l.status === "Planned" && l.source === "Change";
}

export class BayError extends Error {}
