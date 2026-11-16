// Tiny table adapter for the bay register (Round 28).
//
// Production: Supabase Postgres through its REST API (PostgREST), called only
// from the server with the service-role key. Env vars: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. No supabase-js dependency - plain fetch, same as
// lib/airtable.ts.
// PREVIEW_MODE=1: an in-memory copy seeded from lib/bays/mock.ts, so the whole
// module can be demoed locally with no database.
//
// Business logic lives in lib/bays/repo.ts and only ever calls these few
// functions, so both back ends behave the same.

const PREVIEW_MODE = process.env.PREVIEW_MODE === "1";

export type Row = Record<string, any>;
export type Query = {
  eq?: Row;
  in?: { col: string; values: (string | number)[] };
  is?: { col: string; value: null };
  search?: { cols: string[]; q: string };
  order?: { col: string; asc?: boolean }[];
  limit?: number;
};

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  return { url: url.replace(/\/$/, ""), key };
}

function headers(extra: Record<string, string> = {}) {
  const { key } = cfg();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

function enc(v: unknown) {
  return encodeURIComponent(String(v));
}

function qs(q: Query = {}): string {
  const parts: string[] = ["select=*"];
  for (const [k, v] of Object.entries(q.eq || {})) parts.push(`${enc(k)}=eq.${enc(v)}`);
  if (q.in) parts.push(`${enc(q.in.col)}=in.(${q.in.values.map((v) => `"${String(v).replace(/"/g, "")}"`).map(enc).join(",")})`);
  if (q.is) parts.push(`${enc(q.is.col)}=is.null`);
  if (q.search && q.search.q.trim()) {
    // PostgREST "or" with ilike; strip characters that have meaning in the filter grammar.
    const term = q.search.q.trim().replace(/[(),*%]/g, " ").replace(/\s+/g, " ");
    parts.push(`or=(${q.search.cols.map((c) => `${c}.ilike.*${enc(term)}*`).join(",")})`);
  }
  if (q.order?.length) parts.push(`order=${q.order.map((o) => `${o.col}.${o.asc === false ? "desc" : "asc"}`).join(",")}`);
  if (q.limit) parts.push(`limit=${q.limit}`);
  return parts.join("&");
}

async function check(res: Response, what: string) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${what} failed (${res.status}): ${text.slice(0, 300)}`);
  }
}

// ---------------- in-memory (PREVIEW_MODE) ----------------
type MemDb = Record<string, Row[]>;
const g = globalThis as unknown as { __bayMem?: MemDb; __bayPhotos?: Record<string, { type: string; b64: string }> };

async function mem(): Promise<MemDb> {
  if (!g.__bayMem) {
    const { seedPreviewBays } = await import("./mock");
    g.__bayMem = await seedPreviewBays();
  }
  return g.__bayMem;
}

function matches(r: Row, q: Query): boolean {
  for (const [k, v] of Object.entries(q.eq || {})) if (r[k] !== v) return false;
  if (q.in && !q.in.values.map(String).includes(String(r[q.in.col]))) return false;
  if (q.is && r[q.is.col] != null) return false;
  if (q.search && q.search.q.trim()) {
    const words = q.search.q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = q.search.cols.map((c) => String(r[c] ?? "")).join(" ").toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
  }
  return true;
}

function newId() {
  return crypto.randomUUID();
}

// ---------------- public API ----------------
export async function select<T = Row>(table: string, q: Query = {}): Promise<T[]> {
  if (PREVIEW_MODE) {
    let rows = (await mem())[table]?.filter((r) => matches(r, q)) || [];
    for (const o of [...(q.order || [])].reverse()) {
      rows = [...rows].sort((a, b) => (a[o.col] > b[o.col] ? 1 : a[o.col] < b[o.col] ? -1 : 0) * (o.asc === false ? -1 : 1));
    }
    if (q.limit) rows = rows.slice(0, q.limit);
    return JSON.parse(JSON.stringify(rows));
  }
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}?${qs(q)}`, { headers: headers(), cache: "no-store" });
  await check(res, `select ${table}`);
  return res.json();
}

export async function insert<T = Row>(table: string, rows: Row[]): Promise<T[]> {
  if (!rows.length) return [];
  if (PREVIEW_MODE) {
    const db = await mem();
    db[table] = db[table] || [];
    const now = new Date().toISOString();
    // Same column defaults as the SQL schema, so preview rows look like real ones.
    const defaults: Record<string, Row> = {
      bay_events: { at: now },
      exceptions: { opened_at: now, status: "Open", owner_role: "Layout Lead", resolved_at: null },
      photos: { taken_at: now },
      verifications: { at: now },
      reprint_tasks: { status: "Open" },
      bay_lines: { qty: 1, sort: 0, installed_at: null, verified_at: null, removed_at: null },
      bays: { status: "Active", last_verified_at: null, main_photo_id: null, acumatica_quote_nbr: null },
      bay_stores: { active: true },
    };
    const out = rows.map((r) => ({ id: table === "bay_events" ? db[table].length + 1 : newId(), created_at: now, ...(defaults[table] || {}), ...r }));
    db[table].push(...out);
    return JSON.parse(JSON.stringify(out));
  }
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(rows),
  });
  await check(res, `insert ${table}`);
  return res.json();
}

export async function update<T = Row>(table: string, q: Query, patch: Row): Promise<T[]> {
  if (!q.eq && !q.in) throw new Error("update needs a filter");
  if (PREVIEW_MODE) {
    const db = await mem();
    const hit = (db[table] || []).filter((r) => matches(r, q));
    hit.forEach((r) => Object.assign(r, patch));
    return JSON.parse(JSON.stringify(hit));
  }
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}?${qs(q)}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  await check(res, `update ${table}`);
  return res.json();
}

const BUCKET = "bay-photos";

export async function uploadPhotoObject(path: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  if (PREVIEW_MODE) {
    g.__bayPhotos = g.__bayPhotos || {};
    g.__bayPhotos[path] = { type: contentType, b64: Buffer.from(bytes).toString("base64") };
    return;
  }
  const { url, key } = cfg();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path.split("/").map(enc).join("/")}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "x-upsert": "false" },
    body: bytes,
  });
  await check(res, "photo upload");
}

/** Short-lived (1 hour) URL for a private photo. Returns null if the photo can't be found. */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  if (PREVIEW_MODE) {
    const p = g.__bayPhotos?.[path];
    return p ? `data:${p.type};base64,${p.b64}` : null;
  }
  const { url } = cfg();
  const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${path.split("/").map(enc).join("/")}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return body.signedURL ? `${url}/storage/v1${body.signedURL}` : null;
}
