// Minimal Airtable REST API client. No SDK dependency, just fetch.
// Requires AIRTABLE_TOKEN and AIRTABLE_BASE_ID as environment variables.
//
// Exception: when PREVIEW_MODE=1 is set, every function below delegates to
// an in-memory mock store (lib/mockData.ts) instead of calling the real
// Airtable API. This only exists so the app can be previewed end-to-end
// without live credentials - it is never active unless that env var is
// explicitly set, so production/deployed behaviour is unchanged.

const PREVIEW_MODE = process.env.PREVIEW_MODE === "1";

const API_ROOT = "https://api.airtable.com/v0";

function baseId() {
  const id = process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error("AIRTABLE_BASE_ID is not set");
  return id;
}

function token() {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error("AIRTABLE_TOKEN is not set");
  return t;
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    "Content-Type": "application/json",
  };
}

function tableUrl(table: string) {
  return `${API_ROOT}/${baseId()}/${encodeURIComponent(table)}`;
}

export type AirtableRecord<T = Record<string, any>> = {
  id: string;
  createdTime?: string;
  fields: T;
};

/** Fetch every record in a table, optionally filtered/sorted. Handles pagination. */
export async function listRecords<T = Record<string, any>>(
  table: string,
  opts: { filterByFormula?: string; sort?: { field: string; direction?: "asc" | "desc" }[]; maxRecords?: number } = {}
): Promise<AirtableRecord<T>[]> {
  if (PREVIEW_MODE) {
    const { mockListRecords } = await import("./mockData");
    return mockListRecords(table, opts) as Promise<AirtableRecord<T>[]>;
  }

  const records: AirtableRecord<T>[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
    if (opts.maxRecords) params.set("maxRecords", String(opts.maxRecords));
    if (opts.sort) {
      opts.sort.forEach((s, i) => {
        params.set(`sort[${i}][field]`, s.field);
        params.set(`sort[${i}][direction]`, s.direction || "asc");
      });
    }
    if (offset) params.set("offset", offset);

    const res = await fetch(`${tableUrl(table)}?${params.toString()}`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable list "${table}" failed (${res.status}): ${body}`);
    }
    const json = await res.json();
    records.push(...json.records);
    offset = json.offset;
  } while (offset);

  return records;
}

export async function getRecord<T = Record<string, any>>(table: string, id: string): Promise<AirtableRecord<T>> {
  if (PREVIEW_MODE) {
    const { mockGetRecord } = await import("./mockData");
    return mockGetRecord(table, id) as Promise<AirtableRecord<T>>;
  }

  const res = await fetch(`${tableUrl(table)}/${id}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable get "${table}/${id}" failed (${res.status})`);
  return res.json();
}

/** Create records, chunked into batches of 10 (Airtable's per-request limit). */
export async function createRecords<T = Record<string, any>>(
  table: string,
  fieldsArray: T[]
): Promise<AirtableRecord<T>[]> {
  if (PREVIEW_MODE) {
    const { mockCreateRecords } = await import("./mockData");
    return mockCreateRecords(table, fieldsArray as Record<string, any>[]) as Promise<AirtableRecord<T>[]>;
  }

  const created: AirtableRecord<T>[] = [];
  for (let i = 0; i < fieldsArray.length; i += 10) {
    const batch = fieldsArray.slice(i, i + 10);
    const res = await fetch(tableUrl(table), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })) }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable create "${table}" failed (${res.status}): ${body}`);
    }
    const json = await res.json();
    created.push(...json.records);
  }
  return created;
}

export async function updateRecords<T = Record<string, any>>(
  table: string,
  records: { id: string; fields: Partial<T> }[]
): Promise<AirtableRecord<T>[]> {
  if (PREVIEW_MODE) {
    const { mockUpdateRecords } = await import("./mockData");
    return mockUpdateRecords(table, records as { id: string; fields: Record<string, any> }[]) as Promise<AirtableRecord<T>[]>;
  }

  const updated: AirtableRecord<T>[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(tableUrl(table), {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable update "${table}" failed (${res.status}): ${body}`);
    }
    const json = await res.json();
    updated.push(...json.records);
  }
  return updated;
}

export const TABLES = {
  SETTINGS: "Settings",
  SHOWROOMS: "Showrooms",
  POS_CATALOGUE: "POS Master Catalogue",
  AUDITS: "Audits",
  AUDIT_LINE_ITEMS: "Audit Line Items",
  ACTIONS: "Actions",
  POS_REQUESTS: "POS Requests",
} as const;
