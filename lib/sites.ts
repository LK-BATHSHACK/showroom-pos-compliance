// Stores admin (Round 26, Oct 2026) - add stores and choose what each one
// does: POS check on/off, H&S check on/off, and which version of the H&S
// check (Showroom / Warehouse). Server-only: reads/writes the Sites table,
// and keeps the old Showrooms table in step for stores that do POS.
//
// Why Showrooms still matters: the POS check pipeline (scoring, Audits,
// reminders, the Overview dashboard) still runs on the OLD Showrooms table,
// reached from a Site through its SourceShowroom link (see
// resolveShowroomForSite in lib/posWalkaround.ts). So when POS is switched
// on for a store that has no Showroom of its own yet, one is created and
// linked here - otherwise the store's manager would see "Your site isn't
// linked to a Showroom yet" instead of the POS form.

import { listRecords, createRecords, updateRecords, TABLES } from "./airtable";
import { londonToday, dueDateFor } from "./posSchedule";
import { effectiveHSVersion, SITE_TYPES, REGIONS, AUDIT_GROUPS, HS_VERSIONS, type HSVersion } from "./siteConfig";

type SiteFields = {
  SiteName: string;
  SiteType?: string;
  Region?: string;
  AuditGroup?: string;
  Active?: boolean;
  POSChecklistApplies?: boolean;
  "H&SChecklistApplies"?: boolean;
  "H&SVersion"?: string;
  SourceShowroom?: string[];
};

type ShowroomFields = {
  ShowroomName: string;
  Region?: string;
  AuditGroup?: string;
  Active?: boolean;
  NextAuditDue?: string;
};

export type StoreRow = {
  id: string;
  name: string;
  siteType: string | null;
  region: string | null;
  auditGroup: string | null;
  // Airtable checkboxes are ABSENT when unticked (no stored false) - every
  // flag here is read as `=== true`, never `!== false`.
  active: boolean;
  pos: boolean;
  hs: boolean;
  hsVersion: HSVersion;
  showroomName: string | null;
  storeManagers: string[];
};

export type StoreInput = {
  name: string;
  siteType: string;
  region: string;
  auditGroup?: string | null;
  active: boolean;
  pos: boolean;
  hs: boolean;
  hsVersion: string;
};

export async function fetchStores(): Promise<StoreRow[]> {
  const [sites, showrooms, users] = await Promise.all([
    listRecords<SiteFields>(TABLES.SITES),
    listRecords<ShowroomFields>(TABLES.SHOWROOMS),
    listRecords<{ Name?: string; Role?: string; Site?: string[]; Active?: boolean }>(TABLES.USERS),
  ]);
  const showroomName = new Map(showrooms.map((s) => [s.id, s.fields.ShowroomName]));

  return sites
    .map((s) => ({
      id: s.id,
      name: s.fields.SiteName,
      siteType: s.fields.SiteType || null,
      region: s.fields.Region || null,
      auditGroup: s.fields.AuditGroup || null,
      active: s.fields.Active === true,
      pos: s.fields.POSChecklistApplies === true,
      hs: s.fields["H&SChecklistApplies"] === true,
      hsVersion: effectiveHSVersion(s.fields["H&SVersion"], s.fields.SiteType),
      showroomName: s.fields.POSChecklistApplies === true ? showroomName.get(s.fields.SourceShowroom?.[0] || "") || null : null,
      storeManagers: users
        .filter((u) => u.fields.Role === "Store Manager" && u.fields.Active === true && u.fields.Site?.includes(s.id))
        .map((u) => u.fields.Name || "")
        .filter(Boolean),
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

/** Which checks a single site does - used to tailor a Store Manager's nav and landing page. Fails open (both true) so a lookup error never hides a page someone needs. */
export async function getSiteChecks(siteId: string | null | undefined): Promise<{ pos: boolean; hs: boolean }> {
  if (!siteId) return { pos: true, hs: true };
  try {
    const sites = await listRecords<SiteFields>(TABLES.SITES);
    const site = sites.find((s) => s.id === siteId);
    if (!site) return { pos: true, hs: true };
    return { pos: site.fields.POSChecklistApplies === true, hs: site.fields["H&SChecklistApplies"] === true };
  } catch {
    return { pos: true, hs: true };
  }
}

/** Returns an error message, or null if the input is valid. */
export function validateStoreInput(input: Partial<StoreInput>): string | null {
  const name = String(input.name || "").trim();
  if (!name) return "Store name is required.";
  if (name.length > 80) return "Store name is too long (80 characters max).";
  if (!SITE_TYPES.includes(input.siteType as any)) return "Pick a store type.";
  if (!REGIONS.includes(input.region as any)) return "Pick a region.";
  if (!HS_VERSIONS.includes(input.hsVersion as any)) return "Pick an H&S version.";
  if (input.pos && !AUDIT_GROUPS.includes(input.auditGroup as any)) return "Pick a POS audit group for a store that does the POS check.";
  return null;
}

function siteFieldsFrom(input: StoreInput): Record<string, any> {
  return {
    SiteName: input.name.trim(),
    SiteType: input.siteType,
    Region: input.region,
    Active: !!input.active,
    POSChecklistApplies: !!input.pos,
    "H&SChecklistApplies": !!input.hs,
    "H&SVersion": input.hsVersion,
    // AuditGroup is a POS-only concept - cleared for stores that don't do POS.
    AuditGroup: input.pos ? input.auditGroup : null,
  };
}

async function createShowroomFor(input: StoreInput): Promise<string> {
  const [created] = await createRecords<ShowroomFields>(TABLES.SHOWROOMS, [
    {
      ShowroomName: input.name.trim(),
      Region: input.region,
      AuditGroup: input.auditGroup || undefined,
      Active: true,
      // First check is due on the 28th of this month, same as every other store.
      NextAuditDue: dueDateFor(londonToday().slice(0, 7)),
    },
  ]);
  return created.id;
}

function nameTaken(sites: { id: string; fields: SiteFields }[], name: string, exceptId?: string) {
  const n = name.trim().toLowerCase();
  return sites.some((s) => s.id !== exceptId && (s.fields.SiteName || "").trim().toLowerCase() === n);
}

export async function createStore(input: StoreInput): Promise<{ id: string }> {
  const sites = await listRecords<SiteFields>(TABLES.SITES);
  if (nameTaken(sites, input.name)) throw new StoreError("There's already a store with that name.");

  const fields = siteFieldsFrom(input);
  if (input.pos) fields.SourceShowroom = [await createShowroomFor(input)];
  if (!fields.AuditGroup) delete fields.AuditGroup;

  const [created] = await createRecords<SiteFields>(TABLES.SITES, [fields as SiteFields]);
  return { id: created.id };
}

export async function updateStore(id: string, input: StoreInput): Promise<void> {
  const [sites, showrooms] = await Promise.all([listRecords<SiteFields>(TABLES.SITES), listRecords<ShowroomFields>(TABLES.SHOWROOMS)]);
  const site = sites.find((s) => s.id === id);
  if (!site) throw new StoreError("Store not found.");
  if (nameTaken(sites, input.name, id)) throw new StoreError("There's already a store with that name.");

  const fields = siteFieldsFrom(input);
  const linkedShowroomId = site.fields.SourceShowroom?.[0];
  const linkedShowroom = linkedShowroomId ? showrooms.find((s) => s.id === linkedShowroomId) : undefined;
  // Another active POS site already uses this Showroom? (e.g. Antrim
  // Warehouse and Antrim Trade Counter both link to the "Antrim" Showroom
  // for history, but its POS data belongs to Antrim Showroom.) Then this
  // store must NOT share it - its POS checks would land on another store.
  const sharedWithOtherPosSite =
    !!linkedShowroomId &&
    sites.some((s) => s.id !== id && s.fields.Active === true && s.fields.POSChecklistApplies === true && s.fields.SourceShowroom?.includes(linkedShowroomId));

  const showroomUpdates: { id: string; fields: Partial<ShowroomFields> }[] = [];

  if (input.pos) {
    if (!linkedShowroom || sharedWithOtherPosSite) {
      fields.SourceShowroom = [await createShowroomFor(input)];
    } else {
      const sf: Partial<ShowroomFields> = { Active: !!input.active, AuditGroup: input.auditGroup || undefined, Region: input.region };
      // Keep a store's own Showroom name in step when it was created from
      // this page with the same name (older Showrooms use short names like
      // "Dargan" and are left alone).
      if (linkedShowroom.fields.ShowroomName === site.fields.SiteName && input.name.trim() !== site.fields.SiteName) {
        sf.ShowroomName = input.name.trim();
      }
      showroomUpdates.push({ id: linkedShowroom.id, fields: sf });
    }
  } else if (linkedShowroom && site.fields.POSChecklistApplies === true && !sharedWithOtherPosSite) {
    // POS switched off: take the Showroom out of the POS picker, dashboard
    // and reminder emails. History stays - nothing is deleted - and the
    // link is kept so switching POS back on picks the same Showroom up.
    showroomUpdates.push({ id: linkedShowroom.id, fields: { Active: false } });
  }

  await updateRecords(TABLES.SITES, [{ id, fields }]);
  if (showroomUpdates.length) await updateRecords(TABLES.SHOWROOMS, showroomUpdates);
}

/** A validation-type error that's safe to show the admin as-is (vs. an unexpected failure). */
export class StoreError extends Error {}
