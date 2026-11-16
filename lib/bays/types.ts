// Row shapes for the bay register tables (see supabase/bays-schema.sql).

export type LineStatus = "Planned" | "Ordered" | "Installed" | "Verified" | "Removed";
export type LineType = "Product" | "Prop" | "Note" | "Unknown";
export type ChangeStatus = "Awaiting Ryan" | "With store" | "Verified" | "Cancelled" | "Rejected";
export type ChangeAction = "Add" | "Remove" | "Replace";

export type BayStore = {
  airtable_site_id: string;
  code: string;
  name: string;
  region: "NI" | "ROI" | "GB";
  currency: "GBP" | "EUR";
  active: boolean;
};

export type Bay = {
  id: string;
  store_id: string;
  bay_code: string;
  label: string;
  acumatica_quote_nbr: string | null;
  status: "Active" | "Retired";
  last_verified_at: string | null;
  last_verified_by: string | null;
  main_photo_id: string | null;
  created_at: string;
};

export type Product = {
  sku: string;
  description: string;
  item_status: string | null;
  price_unit: "each" | "m2";
  m2_per_box: number | null;
};

export type Price = {
  sku: string;
  currency: "GBP" | "EUR";
  regular_inc_vat: number | null;
  promo_inc_vat: number | null;
  promo_start: string | null;
  promo_end: string | null;
};

export type BayLine = {
  id: string;
  bay_id: string;
  line_type: LineType;
  sku: string | null;
  text: string | null;
  qty: number;
  sort: number;
  status: LineStatus;
  source: "Import" | "Quote" | "Change" | "Capture";
  change_id: string | null;
  installed_at: string | null;
  verified_at: string | null;
  removed_at: string | null;
};

export type Photo = { id: string; bay_id: string; storage_path: string; taken_at: string; taken_by: string | null };

export type ChangeRequest = {
  id: string;
  bay_id: string;
  raised_by: string;
  raised_by_role: string;
  status: ChangeStatus;
  note: string | null;
  needs_order: boolean;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  installed_by: string | null;
  installed_at: string | null;
  due_at: string | null;
  created_at: string;
};

export type ChangeItem = {
  id: string;
  change_id: string;
  action: ChangeAction;
  old_line_id: string | null;
  new_sku: string | null;
  new_text: string | null;
  qty: number;
  seen_on_quote_at: string | null;
};

export type BayException = {
  id: string;
  kind: string;
  store_id: string | null;
  bay_id: string | null;
  bay_line_id: string | null;
  detail: string;
  owner_role: string;
  status: "Open" | "Resolved" | "Dismissed";
  opened_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

/** A line with its product and price joined in, ready to show. */
export type LineView = BayLine & {
  description: string;
  price: { now: number | null; was: number | null; unit: "each" | "m2"; currency: "GBP" | "EUR" } | null;
  itemStatus: string | null;
};
