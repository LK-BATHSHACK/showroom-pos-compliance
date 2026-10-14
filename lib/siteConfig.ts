// Store (Site) set-up options shared by the Stores admin page (client) and
// the server code that reads/writes the Sites table (lib/sites.ts).
// Pure constants + helpers only - no Airtable imports - so client
// components can import this without pulling server code into the bundle.
//
// Added Round 26 (Oct 2026), Lorraine: "Need to be able to add more stores
// and map to what view they should have. For example we want to add
// cookstown and have them fill out a warehouse version of the h&s check -
// they don't need to do POS."

/** Matches the Sites.SiteType single-select options in Airtable. Descriptive only - it doesn't change which questions show. */
export const SITE_TYPES = ["Showroom", "Warehouse", "Trade Counter", "Office", "Clearance Outlet"] as const;

/** Matches the Sites.Region options. Region drives which Emergency Contacts roster Q58 is checked against. */
export const REGIONS = ["NI", "ROI", "GB"] as const;

/** Matches Sites.AuditGroup / Showrooms.AuditGroup. Only relevant when the POS check is on. */
export const AUDIT_GROUPS = ["Group A", "Group B"] as const;

/**
 * Which version of the H&S check a store fills out (Sites."H&SVersion").
 * - Showroom: the standard H&S check.
 * - Warehouse: the standard check PLUS the "Warehouse Section Only"
 *   questions (Template Questions with ScopeType = SiteType and
 *   ScopeSiteType = Warehouse - Q5 to Q9 today).
 * Questions scoped to one named site (e.g. Q4 "For Antrim Warehouse ONLY")
 * stay with that site whatever version is picked here.
 */
export const HS_VERSIONS = ["Showroom", "Warehouse"] as const;
export type HSVersion = (typeof HS_VERSIONS)[number];

export const HS_VERSION_LABELS: Record<HSVersion, string> = {
  Showroom: "Showroom version",
  Warehouse: "Warehouse version (adds the Warehouse section)",
};

/**
 * The H&S version a site actually uses. Reads Sites."H&SVersion" first; if
 * that's blank (e.g. a site added straight into Airtable without it), falls
 * back to the site type - a Warehouse site gets the warehouse version,
 * anything else the showroom version. Same behaviour the app had before
 * this field existed, so nothing changes for a site until someone sets it.
 */
export function effectiveHSVersion(hsVersion: string | null | undefined, siteType: string | null | undefined): HSVersion {
  if (hsVersion === "Showroom" || hsVersion === "Warehouse") return hsVersion;
  return siteType === "Warehouse" ? "Warehouse" : "Showroom";
}
