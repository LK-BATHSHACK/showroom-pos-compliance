-- Bay register schema (Showroom Bay Management module, Round 28).
-- Run once in the Supabase project's SQL editor (Dashboard > SQL > New query > paste > Run).
-- Safe to re-run: every object uses IF NOT EXISTS.
--
-- Access model: Row Level Security is switched ON for every table with NO
-- policies, so the public "anon" key can read and write nothing. The hub talks
-- to Supabase only from the server with the service-role key
-- (SUPABASE_SERVICE_ROLE_KEY, a Vercel env var), and enforces who can see or
-- change which store in lib/bays/access.ts - the same server-side pattern the
-- hub already uses for Airtable.

create extension if not exists pgcrypto;

-- Stores that use the bay register. Linked to the hub's Airtable Sites table by
-- record id; code is the bay-code prefix (LUR, CHE ...).
create table if not exists bay_stores (
  airtable_site_id text primary key,
  code text not null unique check (code ~ '^[A-Z]{2,5}$'),
  name text not null,
  region text not null check (region in ('NI','ROI','GB')),
  currency text not null check (currency in ('GBP','EUR')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bays (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references bay_stores(airtable_site_id),
  bay_code text not null unique,            -- e.g. LUR-10A; printed on the QR label
  label text not null,                      -- as painted on the bay, e.g. "10a"
  acumatica_quote_nbr text,
  status text not null default 'Active' check (status in ('Active','Retired')),
  retired_at timestamptz,
  replaced_by_bay_id uuid references bays(id),
  last_verified_at timestamptz,
  last_verified_by text,
  main_photo_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists bays_store_idx on bays(store_id);

-- Acumatica item cache (filled by the daily sync once Chris confirms the GI).
create table if not exists products (
  sku text primary key,                     -- trimmed text, never a number
  description text not null,
  item_status text,
  item_class text,
  price_unit text not null default 'each' check (price_unit in ('each','m2')),
  m2_per_box numeric,
  shopify_product_id text,
  shopify_variant_id text,
  last_synced_at timestamptz
);
create index if not exists products_desc_idx on products using gin (to_tsvector('simple', description));

create table if not exists prices (
  sku text not null references products(sku),
  currency text not null check (currency in ('GBP','EUR')),
  regular_inc_vat numeric,
  promo_inc_vat numeric,
  promo_start date,
  promo_end date,
  last_synced_at timestamptz,
  primary key (sku, currency)
);

create table if not exists bay_lines (
  id uuid primary key default gen_random_uuid(),
  bay_id uuid not null references bays(id),
  line_type text not null check (line_type in ('Product','Prop','Note','Unknown')),
  sku text,                                 -- null for props/notes/unknown
  text text,                                -- description for props/unknowns, free text for notes
  qty integer not null default 1 check (qty > 0),
  sort integer not null default 0,
  status text not null check (status in ('Planned','Ordered','Installed','Verified','Removed')),
  source text not null check (source in ('Import','Quote','Change','Capture')),
  change_id uuid,
  installed_at timestamptz,
  verified_at timestamptz,
  removed_at timestamptz,
  printed_now numeric,
  printed_was numeric,
  printed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bay_lines_bay_idx on bay_lines(bay_id);
create index if not exists bay_lines_sku_idx on bay_lines(sku);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  bay_id uuid not null references bays(id),
  storage_path text not null,               -- path in the private "bay-photos" bucket
  taken_at timestamptz not null default now(),
  taken_by text,
  verification_id uuid,
  width integer,
  height integer
);

create table if not exists photo_tags (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id),
  bay_line_id uuid not null references bay_lines(id),
  x numeric check (x between 0 and 1),
  y numeric check (y between 0 and 1),
  source text not null default 'Manual' check (source in ('Manual','AI-suggested')),
  confirmed_by text
);

create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  bay_id uuid not null references bays(id),
  raised_by text not null,
  raised_by_role text not null,
  status text not null check (status in ('Awaiting Ryan','With store','Verified','Cancelled','Rejected')),
  note text,
  needs_order boolean not null default false,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  installed_by text,
  installed_at timestamptz,
  install_photo_id uuid,
  due_at date,
  created_at timestamptz not null default now()
);
create index if not exists change_requests_bay_idx on change_requests(bay_id);

create table if not exists change_items (
  id uuid primary key default gen_random_uuid(),
  change_id uuid not null references change_requests(id),
  action text not null check (action in ('Add','Remove','Replace')),
  old_line_id uuid references bay_lines(id),
  new_sku text,
  new_text text,
  qty integer not null default 1,
  seen_on_quote_at timestamptz
);

create table if not exists verifications (
  id uuid primary key default gen_random_uuid(),
  bay_id uuid not null references bays(id),
  kind text not null check (kind in ('Change','Monthly','Capture')),
  by_name text not null,
  at timestamptz not null default now(),
  result text not null check (result in ('Matches','Differences')),
  photo_id uuid
);

create table if not exists verification_items (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references verifications(id),
  bay_line_id uuid references bay_lines(id),
  result text not null check (result in ('Present','Missing','Different','Added')),
  found_sku text,
  note text
);

create table if not exists exceptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- Unknown code, Check difference, Quote drift, No Sales item, No photo ...
  store_id text references bay_stores(airtable_site_id),
  bay_id uuid references bays(id),
  bay_line_id uuid references bay_lines(id),
  detail text not null,
  owner_role text not null default 'Layout Lead',
  status text not null default 'Open' check (status in ('Open','Resolved','Dismissed')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text
);
create index if not exists exceptions_open_idx on exceptions(status, store_id);

create table if not exists reprint_tasks (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references bay_stores(airtable_site_id),
  bay_id uuid not null references bays(id),
  reason text not null check (reason in ('Price change','Bay change')),
  status text not null default 'Open' check (status in ('Open','Printed')),
  created_at timestamptz not null default now(),
  printed_at timestamptz,
  printed_by text
);

create table if not exists bay_events (
  id bigserial primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  actor text,
  at timestamptz not null default now(),
  detail jsonb
);
create index if not exists bay_events_entity_idx on bay_events(entity, entity_id);

create table if not exists sync_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'Running' check (status in ('Running','Succeeded','Failed')),
  rows_read integer,
  rows_changed integer,
  error text
);

create table if not exists bay_settings (
  key text primary key,
  value text not null
);
insert into bay_settings(key, value) values
  ('install_reminder_days', '3'),
  ('install_escalate_days', '7'),
  ('weekly_summary_days', '14'),
  ('monthly_check_percent', '25')
on conflict (key) do nothing;

-- RLS on, no policies: only the server's service-role key can read or write.
do $$
declare t text;
begin
  foreach t in array array['bay_stores','bays','products','prices','bay_lines','photos','photo_tags','change_requests',
                           'change_items','verifications','verification_items','exceptions','reprint_tasks','bay_events',
                           'sync_runs','bay_settings'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Private bucket for bay photos (served to the app through short-lived signed URLs).
insert into storage.buckets (id, name, public) values ('bay-photos', 'bay-photos', false)
on conflict (id) do nothing;
