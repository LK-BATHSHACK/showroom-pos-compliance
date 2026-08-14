// In-memory mock data layer used ONLY for local preview when PREVIEW_MODE=1.
// Lets the app run end-to-end (dashboard, drill-downs, actions, requests,
// approve/decline, new-request submission) without a real Airtable base.
// Not used at all in production - lib/airtable.ts only calls into this when
// the PREVIEW_MODE env var is explicitly set.

import { TABLES } from "./airtable";

type Rec = { id: string; createdTime: string; fields: Record<string, any> };

let idCounter = 1000;
function nextId(prefix: string) {
  idCounter++;
  return `rec${prefix}${idCounter}`;
}

const showroomSeed: { name: string; region: string; group: string; score: number; rag: string; tier: string; lastAudit: string; nextDue: string; address: string }[] = [
  { name: "Boucher", region: "NI", group: "Group A", score: 92, rag: "Green", tier: "Standard", lastAudit: "2026-07-22", nextDue: "2026-08-19", address: "42 Boucher Road, Belfast" },
  { name: "Shore Rd.", region: "NI", group: "Group A", score: 61, rag: "Amber", tier: "Priority", lastAudit: "2026-07-15", nextDue: "2026-08-12", address: "310 Shore Road, Newtownabbey" },
  { name: "Dargan", region: "NI", group: "Group A", score: 38, rag: "Red", tier: "At Risk", lastAudit: "2026-06-30", nextDue: "2026-07-28", address: "Dargan Crescent, Belfast" },
  { name: "Antrim", region: "NI", group: "Group B", score: 78, rag: "Green", tier: "Standard", lastAudit: "2026-05-10", nextDue: "2026-08-08", address: "Fenaghy Road, Antrim" },
  { name: "Cork", region: "ROI", group: "Group A", score: 85, rag: "Green", tier: "Standard", lastAudit: "2026-07-20", nextDue: "2026-08-17", address: "Kinsale Road, Cork" },
  { name: "Dublin", region: "ROI", group: "Group A", score: 55, rag: "Amber", tier: "Priority", lastAudit: "2026-07-05", nextDue: "2026-08-02", address: "Naas Road, Dublin 12" },
  { name: "Manchester", region: "GB", group: "Group B", score: null as any, rag: "", tier: "Standard", lastAudit: "", nextDue: "2026-08-25", address: "Trafford Park, Manchester" },
];

const showrooms: Rec[] = showroomSeed.map((s) => ({
  id: nextId("shw"),
  createdTime: "2026-06-01T09:00:00.000Z",
  fields: {
    ShowroomName: s.name,
    Region: s.region,
    AuditGroup: s.group,
    ShowroomType: "Large format",
    Active: true,
    ShowroomManagerEmail: `${s.name.toLowerCase().replace(/[^a-z]/g, "")}.manager@bathshack.com`,
    RegionalManagerEmail: "regional.manager@bathshack.com",
    LastAuditDate: s.lastAudit || undefined,
    NextAuditDue: s.nextDue,
    ComplianceScore: s.score ?? undefined,
    RAGStatus: s.rag || undefined,
    SupportTier: s.tier,
    Address: s.address,
  },
}));

const byName = (n: string) => showrooms.find((s) => s.fields.ShowroomName === n)!;

const posCatalogue: Rec[] = [
  { name: "Bay-end Lifestyle Panel", category: "POS on Bays", weight: 3 },
  { name: "Tap Range Comparison Card", category: "Sales POS", weight: 2 },
  { name: "Welcome Totem", category: "Showroom Entrance", weight: 3 },
  { name: "Card Reader Wrap", category: "Terminals", weight: 1 },
  { name: "Bathroom Sensory Diffuser", category: "Showroom Branded Scent", weight: 1 },
  { name: "Accessible WC Signage", category: "Toilets", weight: 2 },
  { name: "Finance Offer Window Cling", category: "Other Signage", weight: 2 },
  { name: "Customer WC Vanity Card", category: "Customer Bathrooms", weight: 1 },
].map((p) => ({
  id: nextId("pos"),
  createdTime: "2026-05-01T09:00:00.000Z",
  fields: {
    POSName: p.name,
    Category: p.category,
    Description: `${p.name} - standard estate rollout item.`,
    RequiredOptional: "Required",
    ApplicableShowroomTypes: "Large format",
    Status: "Active",
    Weight: p.weight,
    LaunchDate: "2026-01-15",
  },
}));

const audits: Rec[] = [
  {
    id: nextId("aud"),
    createdTime: "2026-07-22T10:00:00.000Z",
    fields: {
      Showroom: [byName("Boucher").id],
      AuditType: "Physical (Group A)",
      AuditDate: "2026-07-22",
      CompletedByName: "Ciara Doyle",
      CompletedByEmail: "ciara.doyle@bathshack.com",
      OverallComplianceScore: 92,
      RAGStatus: "Green",
      GeneralComments: "Showroom in great shape, minor tidy-up needed near the entrance bay.",
      SupportRequiredFromMarketing: false,
      Status: "Reviewed",
    },
  },
  {
    id: nextId("aud"),
    createdTime: "2026-07-15T10:00:00.000Z",
    fields: {
      Showroom: [byName("Shore Rd.").id],
      AuditType: "Physical (Group A)",
      AuditDate: "2026-07-15",
      CompletedByName: "Marcus Webb",
      CompletedByEmail: "marcus.webb@bathshack.com",
      OverallComplianceScore: 61,
      RAGStatus: "Amber",
      GeneralComments: "Several bays missing lifestyle panels, terminal wraps peeling.",
      SupportRequiredFromMarketing: true,
      SupportRequiredDetails: "Need replacement bay-end panels shipped.",
      Status: "Actions Created",
    },
  },
  {
    id: nextId("aud"),
    createdTime: "2026-06-30T10:00:00.000Z",
    fields: {
      Showroom: [byName("Dargan").id],
      AuditType: "Physical (Group A)",
      AuditDate: "2026-06-30",
      CompletedByName: "Marcus Webb",
      CompletedByEmail: "marcus.webb@bathshack.com",
      OverallComplianceScore: 38,
      RAGStatus: "Red",
      GeneralComments: "Multiple critical items missing or incorrectly branded. Escalated to regional manager.",
      SupportRequiredFromMarketing: true,
      SupportRequiredDetails: "Full POS refresh needed - showroom relocated bays since last reset.",
      Status: "Actions Created",
    },
  },
];

const actions: Rec[] = [
  {
    id: nextId("act"),
    createdTime: "2026-07-15T11:00:00.000Z",
    fields: {
      Showroom: [byName("Shore Rd.").id],
      IssueDescription: "Bay-end lifestyle panel missing on tap aisle",
      Priority: "High",
      OwnerName: "Marcus Webb",
      OwnerEmail: "marcus.webb@bathshack.com",
      DateIdentified: "2026-07-15",
      TargetCompletionDate: "2026-08-05",
      Status: "In Progress",
    },
  },
  {
    id: nextId("act"),
    createdTime: "2026-07-15T11:05:00.000Z",
    fields: {
      Showroom: [byName("Shore Rd.").id],
      IssueDescription: "Card reader wrap peeling at terminal 2",
      Priority: "Medium",
      OwnerName: "Marcus Webb",
      OwnerEmail: "marcus.webb@bathshack.com",
      DateIdentified: "2026-07-15",
      TargetCompletionDate: "2026-08-01",
      Status: "Open",
    },
  },
  {
    id: nextId("act"),
    createdTime: "2026-06-30T11:00:00.000Z",
    fields: {
      Showroom: [byName("Dargan").id],
      IssueDescription: "Welcome totem showing discontinued campaign branding",
      Priority: "Critical",
      OwnerName: "Marcus Webb",
      OwnerEmail: "marcus.webb@bathshack.com",
      DateIdentified: "2026-06-30",
      TargetCompletionDate: "2026-07-21",
      Status: "Open",
    },
  },
  {
    id: nextId("act"),
    createdTime: "2026-06-30T11:05:00.000Z",
    fields: {
      Showroom: [byName("Dargan").id],
      IssueDescription: "Accessible WC signage missing braille panel",
      Priority: "Critical",
      OwnerName: "Marcus Webb",
      OwnerEmail: "marcus.webb@bathshack.com",
      DateIdentified: "2026-06-30",
      TargetCompletionDate: "2026-07-14",
      Status: "Open",
    },
  },
  {
    id: nextId("act"),
    createdTime: "2026-05-12T11:00:00.000Z",
    fields: {
      Showroom: [byName("Boucher").id],
      IssueDescription: "Customer WC vanity card faded",
      Priority: "Low",
      OwnerName: "Ciara Doyle",
      OwnerEmail: "ciara.doyle@bathshack.com",
      DateIdentified: "2026-05-12",
      TargetCompletionDate: "2026-06-01",
      DateCompleted: "2026-05-30",
      Status: "Verified-Closed",
      VerifiedAtNextAudit: true,
    },
  },
];

const posRequests: Rec[] = [
  {
    id: nextId("req"),
    createdTime: "2026-08-05T09:00:00.000Z",
    fields: {
      Showroom: [byName("Cork").id],
      RequesterName: "Aoife Ryan",
      RequesterEmail: "aoife.ryan@bathshack.com",
      RequestDate: "2026-08-05",
      IdeaDescription: "Scented reed diffusers at the showroom entrance instead of just the bathroom PODs",
      BusinessReason: "Customers keep commenting on the diffuser scent near the WC display - would help brand the whole entrance.",
      CustomerProblemOpportunity: "First impression is currently just signage, no sensory element.",
      SuggestedLocation: "Entrance lobby, either side of the welcome totem",
      ProductCategory: "Showroom Entrance",
      Urgency: "Low",
      OtherShowroomsMayBenefit: true,
      Status: "Submitted",
    },
  },
  {
    id: nextId("req"),
    createdTime: "2026-08-02T09:00:00.000Z",
    fields: {
      Showroom: [byName("Dublin").id],
      RequesterName: "Sean Byrne",
      RequesterEmail: "sean.byrne@bathshack.com",
      RequestDate: "2026-08-02",
      IdeaDescription: "QR code on tap comparison cards linking to install videos",
      BusinessReason: "Reduces basic install questions to sales staff, speeds up the sale.",
      CustomerProblemOpportunity: "Customers want to see it installed before buying.",
      SuggestedLocation: "Tap aisle bay-ends",
      ProductCategory: "Sales POS",
      Urgency: "Medium",
      OtherShowroomsMayBenefit: true,
      Status: "Under Review",
      MarketingComments: "Checking with e-commerce team whether install videos already exist.",
    },
  },
  {
    id: nextId("req"),
    createdTime: "2026-07-28T09:00:00.000Z",
    fields: {
      Showroom: [byName("Boucher").id],
      RequesterName: "Ciara Doyle",
      RequesterEmail: "ciara.doyle@bathshack.com",
      RequestDate: "2026-07-28",
      IdeaDescription: "Loyalty club sign-up card at the till point",
      BusinessReason: "Sign-up rate is low without a physical prompt at point of sale.",
      CustomerProblemOpportunity: "Customers forget to join before they leave.",
      SuggestedLocation: "Till point, next to card reader",
      ProductCategory: "Terminals",
      Urgency: "Medium",
      OtherShowroomsMayBenefit: true,
      Status: "Approved",
      MarketingComments: "Good idea, adding to next print run.",
      DecisionDate: "2026-08-01",
      DecisionByName: "Lorraine Kelly",
      PipelineStage: "Design",
    },
  },
  {
    id: nextId("req"),
    createdTime: "2026-07-20T09:00:00.000Z",
    fields: {
      Showroom: [byName("Antrim").id],
      RequesterName: "Niamh Walsh",
      RequesterEmail: "niamh.walsh@bathshack.com",
      RequestDate: "2026-07-20",
      IdeaDescription: "Neon-effect showroom entrance sign",
      BusinessReason: "Saw a competitor using one, thought it looked eye-catching.",
      CustomerProblemOpportunity: "N/A - purely aesthetic.",
      SuggestedLocation: "Entrance facade",
      ProductCategory: "Showroom Entrance",
      Urgency: "Low",
      OtherShowroomsMayBenefit: false,
      Status: "Declined",
      MarketingComments: "Doesn't fit current brand guidelines - off-brand colour palette.",
      DecisionDate: "2026-07-25",
      DecisionByName: "Lorraine Kelly",
    },
  },
];

const settings: Rec[] = [
  { id: nextId("set"), createdTime: "2026-01-01T00:00:00.000Z", fields: { SettingName: "GroupA_AuditCadenceDays", SettingValue: 28 } },
  { id: nextId("set"), createdTime: "2026-01-01T00:00:00.000Z", fields: { SettingName: "GroupB_AuditCadenceDays", SettingValue: 90 } },
];

const auditLineItems: Rec[] = [];

const store: Record<string, Rec[]> = {
  [TABLES.SETTINGS]: settings,
  [TABLES.SHOWROOMS]: showrooms,
  [TABLES.POS_CATALOGUE]: posCatalogue,
  [TABLES.AUDITS]: audits,
  [TABLES.AUDIT_LINE_ITEMS]: auditLineItems,
  [TABLES.ACTIONS]: actions,
  [TABLES.POS_REQUESTS]: posRequests,
};

function tablePrefix(table: string) {
  return table.slice(0, 3).toLowerCase();
}

// Replicates just the one filterByFormula shape this app actually uses:
// SEARCH("<name>", ARRAYJOIN({Showroom})) > 0  -- i.e. "linked Showroom's
// display name contains this text". Real Airtable resolves {Showroom} to
// the linked record's primary field inside formulas; here we do the same
// by looking up the showroom name for each record's linked id.
function matchesFilter(rec: Rec, filterByFormula?: string): boolean {
  if (!filterByFormula) return true;
  const m = filterByFormula.match(/SEARCH\("(.*)",\s*ARRAYJOIN\(\{(\w+)\}\)\)/);
  if (!m) return true;
  const [, needle, field] = m;
  const ids: string[] = rec.fields[field] || [];
  const names = ids.map((id) => showrooms.find((s) => s.id === id)?.fields.ShowroomName).filter(Boolean);
  return names.some((n) => n === needle);
}

export function mockListRecords(table: string, opts: { filterByFormula?: string; sort?: { field: string; direction?: "asc" | "desc" }[] } = {}) {
  let recs = (store[table] || []).filter((r) => matchesFilter(r, opts.filterByFormula));
  if (opts.sort?.length) {
    const { field, direction } = opts.sort[0];
    recs = [...recs].sort((a, b) => {
      const av = a.fields[field] ?? "";
      const bv = b.fields[field] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return direction === "desc" ? -cmp : cmp;
    });
  }
  return Promise.resolve(recs);
}

export function mockGetRecord(table: string, id: string) {
  const rec = (store[table] || []).find((r) => r.id === id);
  if (!rec) throw new Error(`Mock record not found: ${table}/${id}`);
  return Promise.resolve(rec);
}

export function mockCreateRecords(table: string, fieldsArray: Record<string, any>[]) {
  if (!store[table]) store[table] = [];
  const created = fieldsArray.map((fields) => ({ id: nextId(tablePrefix(table)), createdTime: new Date(0).toISOString(), fields }));
  store[table].push(...created);
  return Promise.resolve(created);
}

export function mockUpdateRecords(table: string, records: { id: string; fields: Record<string, any> }[]) {
  const updated: Rec[] = [];
  records.forEach(({ id, fields }) => {
    const rec = (store[table] || []).find((r) => r.id === id);
    if (rec) {
      Object.assign(rec.fields, fields);
      updated.push(rec);
    }
  });
  return Promise.resolve(updated);
}
