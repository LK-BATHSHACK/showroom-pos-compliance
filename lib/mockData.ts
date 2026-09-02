// In-memory mock data layer used ONLY for local preview when PREVIEW_MODE=1.
// Lets the app run end-to-end without a real Airtable base or Vercel
// deployment - both the original POS pages (dashboard, drill-downs, actions,
// requests, approve/decline, new-request submission) and, as of 31 Aug 2026,
// login and the H&S Walkaround flow (Users/Sites/Checklist Templates/
// Template Questions/Rosters/Submissions/Answers - see below). Not used at
// all in production - lib/airtable.ts only calls into this when the
// PREVIEW_MODE env var is explicitly set. To try it locally:
//   PREVIEW_MODE=1 SESSION_SECRET=dev npm run dev
// then sign in as any of the four seeded preview accounts below (password
// "Preview123!" for all of them).

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
      Status: "In progress",
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

// ---------------------------------------------------------------------------
// Generalised compliance-tool tables (Users/Sites/Checklist Templates/
// Template Questions/Rosters/Submissions/Answers) - added so PREVIEW_MODE
// covers login and the H&S Walkaround flow, not just the old POS pages.
//
// Template Questions is a REPRESENTATIVE SUBSET of the real 65-question H&S
// checklist (~26 questions), not the full set - chosen to exercise every
// answer type (short/long text, date, yes/no, single/multiple choice,
// matrix, file upload) and every special-case code path in
// lib/hsSubmission.ts (roster mismatches, immediate escalation, explicit
// issue fields, training/risk-assessment requests, SiteType and NamedSites
// scoping). Question text/options/scoping below is copied verbatim from the
// real Template Questions table in Airtable (base appCJQDoT7p1FJY5Q, 31 Aug
// 2026) - this is a smaller preview-only copy of real rows, not invented
// text. Full-fidelity (all 65) wasn't worth the transcription effort for a
// local demo aid that's never used in production.
// ---------------------------------------------------------------------------

// sourceShowroomName maps a Site back to the old Showrooms table via the
// SourceShowroom link field (Sites and Showrooms deliberately DON'T share
// naming - e.g. Site "Dargan Showroom" vs Showroom "Dargan" - see
// resolveShowroomForSite in lib/posWalkaround.ts, which resolves through
// this link rather than name-matching). Left undefined for sites with no
// old-Showrooms equivalent - Cheadle is a genuinely new POS+H&S site added
// straight into Sites with no migration history, and Antrim Warehouse has
// POSChecklistApplies=false so it never needs one; both are realistic
// "POS doesn't apply here" cases for the in-tool form to handle gracefully.
const siteSeed: { name: string; siteType: string; region: string; pos: boolean; hs: boolean; sourceShowroomName?: string }[] = [
  { name: "Boucher", siteType: "Showroom", region: "NI", pos: true, hs: true, sourceShowroomName: "Boucher" },
  { name: "Shore Rd.", siteType: "Showroom", region: "NI", pos: true, hs: true, sourceShowroomName: "Shore Rd." },
  { name: "Dargan Showroom", siteType: "Showroom", region: "NI", pos: true, hs: true, sourceShowroomName: "Dargan" },
  { name: "Antrim Showroom", siteType: "Showroom", region: "NI", pos: true, hs: true, sourceShowroomName: "Antrim" },
  { name: "Antrim Warehouse & Offices", siteType: "Warehouse", region: "NI", pos: false, hs: true },
  { name: "Cork Showroom", siteType: "Showroom", region: "ROI", pos: true, hs: true, sourceShowroomName: "Cork" },
  { name: "Dublin Showroom", siteType: "Showroom", region: "ROI", pos: true, hs: true, sourceShowroomName: "Dublin" },
  { name: "Cheadle", siteType: "Showroom", region: "GB", pos: true, hs: true },
];

const sites: Rec[] = siteSeed.map((s) => ({
  id: nextId("sit"),
  createdTime: "2026-08-31T09:00:00.000Z",
  fields: {
    SiteName: s.name,
    SiteType: s.siteType,
    Region: s.region,
    Active: true,
    POSChecklistApplies: s.pos,
    "H&SChecklistApplies": s.hs,
    SourceShowroom: s.sourceShowroomName ? [byName(s.sourceShowroomName).id] : [],
  },
}));

const siteByName = (n: string) => sites.find((s) => s.fields.SiteName === n)!;

const checklistTemplates: Rec[] = [
  { id: nextId("tpl"), createdTime: "2026-08-31T09:00:00.000Z", fields: { TemplateName: "POS Compliance", Version: 1, Status: "Active", ScoringModel: "Weighted score (100pt)" } },
  { id: nextId("tpl"), createdTime: "2026-08-31T09:00:00.000Z", fields: { TemplateName: "H&S Walkaround", Version: 1, Status: "Active", ScoringModel: "Pass/fail with escalation" } },
];
const hsTemplateId = checklistTemplates[1].id;

type QSeed = {
  qnum: number;
  section: string;
  order: number;
  text: string;
  answerType: string;
  options?: string;
  required?: boolean;
  scopeType?: "AllSites" | "SiteType" | "NamedSites";
  scopeSiteType?: string;
  scopeSiteNames?: string[];
  rosterRole?: string;
  urgency?: "Digest" | "Immediate";
};

const hsQuestionSeed: QSeed[] = [
  { qnum: 1, section: "General Information", order: 1, text: "Person completing inspection", answerType: "Short answer", required: true },
  { qnum: 2, section: "General Information", order: 2, text: "Date of inspection", answerType: "Date", required: true },
  { qnum: 4, section: "General Information", order: 4, text: "For Antrim Warehouse ONLY - Has your racking inspection led to any requirements for change? (please note changes due/planned)", answerType: "Short answer", required: true, scopeType: "NamedSites", scopeSiteNames: ["Antrim Warehouse & Offices"] },
  { qnum: 5, section: "Warehouse Section Only", order: 5, text: "Material handling and storage — rate each of the following", answerType: "Matrix", options: "Is shelving/racking maintained in good condition?; Is a Safe Working Load sticker displayed where required?; Is lifting equipment (e.g. forklift trucks) in good condition and inspected in date?", required: true, scopeType: "SiteType", scopeSiteType: "Warehouse" },
  { qnum: 6, section: "Warehouse Section Only", order: 6, text: "Does your site have any LOLER equipment (i.e. forklift, reach truck etc)?", answerType: "Yes/No", required: true, scopeType: "SiteType", scopeSiteType: "Warehouse" },
  { qnum: 7, section: "Warehouse Section Only", order: 7, text: "Can you provide the name of the equipment and the date it was last checked/maintained by a specialist? (if you don't know, please state this in the box and we will help you find out)", answerType: "Short answer", required: false, scopeType: "SiteType", scopeSiteType: "Warehouse" },
  { qnum: 8, section: "Warehouse Section Only", order: 8, text: "There is now a form for completing Hand Pallet Truck Checks - Hand Pallet Checks (fill out form) https://forms.cloud.microsoft/e/0pULB3kb6b", answerType: "Single choice", options: "I've just completed it; Not Required in this area", required: true, scopeType: "SiteType", scopeSiteType: "Warehouse" },
  { qnum: 9, section: "Warehouse Section Only", order: 9, text: "Report any issues here with anything warehouse related", answerType: "Long answer", options: "n/a if no issues", scopeType: "SiteType", scopeSiteType: "Warehouse" },
  { qnum: 11, section: "Posters, Visuals & Documents", order: 11, text: "Is this poster displayed in your site location - and does it have ALL the same reps on it (Justin, Ashley, Gavin and Chloe)?", answerType: "Single choice", options: "Yes; Report issue/Order Replacement", required: true, rosterRole: "H&S Rep" },
  { qnum: 13, section: "Posters, Visuals & Documents", order: 13, text: "Report any issues here", answerType: "Long answer", options: "n/a if no issues" },
  { qnum: 14, section: "Welfare Facilities", order: 14, text: "Do your staff members have access to:\n• Working toilets and wash-hand basins with soap and drying facilities\n• Drinking water\n• A place to store clothing (and somewhere to change if special clothing is worn for work)\n• Somewhere to rest and eat meals if appropriate\n• Sanitary disposal bin (please check customer and employee toilets)", answerType: "Yes/No", required: true },
  { qnum: 16, section: "Welfare Facilities", order: 16, text: "Is there a process/schedule for bins/any food waste/fridges to be cleaned out regularly?", answerType: "Yes/No", required: true },
  { qnum: 17, section: "Welfare Facilities", order: 17, text: "Report issue here", answerType: "Short answer", required: false },
  { qnum: 18, section: "Manual Handling", order: 18, text: "All staff on site have completed the Academy Manual Handling Course. (If no, please ensure this is completed by the next monthly check.)", answerType: "Yes/No" },
  { qnum: 19, section: "Manual Handling", order: 19, text: "Is a safe lifting technique poster displayed on site?", answerType: "Single choice", options: "Yes - we have one of these displayed; Request a poster", required: true },
  { qnum: 23, section: "Hazards & Housekeeping Standards", order: 23, text: "Please confirm you have enough signage displayed around the showroom warning that children must be supervised at all times.", answerType: "Single choice", options: "Yes, I confirm I have enough signage; Request more posters", required: true },
  { qnum: 24, section: "Hazards & Housekeeping Standards", order: 24, text: "How many copies?", answerType: "Single choice", options: "One; Two; Three; Four", required: true },
  { qnum: 26, section: "Hazards & Housekeeping Standards", order: 26, text: "Report issue here", answerType: "Short answer" },
  { qnum: 27, section: "Hazards & Housekeeping Standards", order: 27, text: "Please check the linked list of any products you have on site that contain a danger label (y/s if none) \nhttps://bathshackm365.sharepoint.com/:x:/r/sites/BathshackIntranet/_layouts/15/Doc.aspx?sourcedoc=%7BA090D26B-A9A2-4EEC-B106-37823EF2BF4B%7D&file=All%20Areas%20Hazardous%20Materials%20List%20.xlsx&action=default&mobileredirect=true", answerType: "Single choice", options: "I have checked the list via the link and added any new materials used/removed any no longer used; I have updated the dates recorded and put my name on it (new showroom tabs have been added); I am unable to check the list - I need help", required: true },
  { qnum: 31, section: "Fire Warden Checklist", order: 31, text: "Who is the Fire Warden at your site? (Please ensure the poster has their name on it.)", answerType: "Short answer" },
  { qnum: 35, section: "Fire Warden Checklist", order: 35, text: "Fire Warden Duties - please work with your fire warden to ensure all the below have been checked. Any items ticked 'No' must be referenced/reported in the next question.", answerType: "Matrix", options: "Fire Action Notices are displayed at Manual Call points and first exit doors; All fire safety equipment, fire hoses and fire extinguishers are in position, undamaged, and classified (all tamper tags intact); Fire doors in good condition (satisfying all strips, closers, push pads and push bars); A fire evacuation plan (to assembly point) is on the wall and visible", required: true },
  { qnum: 40, section: "Fire Warden Checklist", order: 40, text: "Report any issues here", answerType: "Long answer", options: "n/a if no issues" },
  { qnum: 41, section: "First Aid", order: 41, text: "Who is the first aid appointed person on site? (check their certificate is in date via the training section on Breathe; ensure their name is on the poster)", answerType: "Short answer", required: true },
  { qnum: 49, section: "First Aid", order: 49, text: "Have any items of kit been used? (this should be recorded as an accident since last month)", answerType: "Yes/No", required: true },
  { qnum: 50, section: "First Aid", order: 50, text: "Report any issues here", answerType: "Long answer", options: "n/a if no issues" },
  { qnum: 51, section: "Mental Health First Aid", order: 51, text: "This poster is displayed on site (check the toilet doors, it may be there). Current MHFAs are Chris, Salli and Julia Kerr - please update the poster accordingly.", answerType: "Single choice", options: "I've had a new poster sent to me with the correct names on (Salli, Chris and Julia); I will print off a new version now (find it in the transport chat group on Teams); Missing poster - no printer on site, please send me one", required: true, rosterRole: "Mental Health First Aider" },
  { qnum: 53, section: "Accidents, Incidents or Near Misses", order: 53, text: "Have any accidents/incidents or near misses happened in the last month? (check the accident/incident log or completed near miss sheets - STOP REPORT ACTION sheets)", answerType: "Single choice", options: "Yes - please upload a photo of any new and completed accident/incident/fire log or near miss book pages since the last checklist completion immediately to Salli; No", required: true, urgency: "Immediate" },
  { qnum: 54, section: "Accidents, Incidents or Near Misses", order: 54, text: "How many Accidents, Incidents or Near Miss reports will you be emailing to Salli for this month?", answerType: "Single choice", options: "0; 1; 2; 3; More than 3", required: true, urgency: "Immediate" },
  { qnum: 57, section: "Security", order: 57, text: "Report any issues here", answerType: "Long answer", options: "n/a if no issues" },
  { qnum: 58, section: "Security", order: 58, text: "Is the EMERGENCY CONTACTS poster displayed on your noticeboard? (NEW)", answerType: "Single choice", options: "Yes, and it has Julia, Ryan and Ruaidhri on; Yes, and it has Gavin, Ryan and Ruaidhri on; No, please email me a copy to print; No, I don't have a printer, please post me a copy; WAREHOUSE - Not Required", rosterRole: "Emergency Contact" },
  { qnum: 61, section: "And finally...", order: 61, text: "Have you added any new items to the Maintenance Task Planner this month? (we will check they have been logged and are under review; please be specific about what you've added if it's not obvious)", answerType: "Short answer" },
  { qnum: 62, section: "And finally...", order: 62, text: "Please upload photos of any issues you've reported for maintenance to review for prioritising", answerType: "File upload", options: "Max 10 files, 10MB each. Allowed: Word, Excel, PPT, PDF, image, video, audio" },
  { qnum: 63, section: "And finally...", order: 63, text: "I need to request training for...", answerType: "Single choice", options: "First Aider on site (for larger sites); First aid appointed person training (suitable for most showrooms); Fire Warden" },
  { qnum: 65, section: "And finally...", order: 65, text: "I need a specific risk assessment (please choose a reason)", answerType: "Multiple choice (checkboxes)", options: "Not Required; New expectant mother on site; New young person (under 18) working on site; Recent serious accident or near miss; A pattern of accidents or near misses; Introduction of new equipment; Process changes; New information about a hazard; Regular Lone Working; Other", required: true },
];

const templateQuestions: Rec[] = hsQuestionSeed.map((q) => ({
  id: nextId("tq"),
  createdTime: "2026-08-31T09:00:00.000Z",
  fields: {
    QuestionText: q.text,
    Template: [hsTemplateId],
    Section: q.section,
    OrderIndex: q.order,
    QuestionNumber: q.qnum,
    AnswerType: q.answerType,
    OptionsNotes: q.options || undefined,
    Required: !!q.required,
    ScopeType: q.scopeType || "AllSites",
    ScopeSiteType: q.scopeSiteType || undefined,
    ScopeSites: q.scopeSiteNames ? q.scopeSiteNames.map((n) => siteByName(n).id) : [],
    RosterRole: q.rosterRole || undefined,
    UrgencyClass: q.urgency || "Digest",
  },
}));

const tqByQnum = (n: number) => templateQuestions.find((t) => t.fields.QuestionNumber === n)!;

const rosters: Rec[] = [
  { id: nextId("ros"), createdTime: "2026-08-31T09:00:00.000Z", fields: { RosterName: "H&S Reps - Company-wide", Role: "H&S Rep", Scope: "Company-wide", Names: "Justin, Ashley, Gavin, Chloe", TemplateQuestions: [tqByQnum(11).id], Confirmed: false } },
  { id: nextId("ros"), createdTime: "2026-08-31T09:00:00.000Z", fields: { RosterName: "Mental Health First Aiders - Company-wide", Role: "Mental Health First Aider", Scope: "Company-wide", Names: "Chris, Salli, Julia Kerr", TemplateQuestions: [tqByQnum(51).id], Confirmed: false } },
  { id: nextId("ros"), createdTime: "2026-08-31T09:00:00.000Z", fields: { RosterName: "Emergency Contacts - NI", Role: "Emergency Contact", Scope: "Region", Region: "NI", Names: "Julia, Ryan, Ruaidhri", TemplateQuestions: [tqByQnum(58).id], Confirmed: true } },
  { id: nextId("ros"), createdTime: "2026-08-31T09:00:00.000Z", fields: { RosterName: "Emergency Contacts - ROI", Role: "Emergency Contact", Scope: "Region", Region: "ROI", Names: "Gavin, Ryan, Ruaidhri", TemplateQuestions: [tqByQnum(58).id], Confirmed: true } },
  { id: nextId("ros"), createdTime: "2026-08-31T09:00:00.000Z", fields: { RosterName: "Emergency Contacts - GB", Role: "Emergency Contact", Scope: "Region", Region: "GB", Names: "Clint Heaton", TemplateQuestions: [tqByQnum(58).id], Confirmed: true } },
];

// Preview-only synthetic accounts, one per role - NOT real Bathshack
// credentials. Password for all four is "Preview123!" (hash precomputed
// with the same PBKDF2 settings as lib/auth.ts, 210,000 iterations). Only
// reachable when PREVIEW_MODE=1, which is never set in production.
const PREVIEW_PASSWORD_HASH = "pbkdf2$210000$4vyximw18nP8JMgxZZpJ5g==$GENnjdNKuEJC1kJOv6WwGID+6hF20UWdWyxzKX2Mqmw=";

const users: Rec[] = [
  { id: nextId("usr"), createdTime: "2026-08-31T09:00:00.000Z", fields: { Name: "Preview Admin", Email: "preview.admin@bathshack.com", PasswordHash: PREVIEW_PASSWORD_HASH, Role: "Admin", Active: true, MustChangePassword: false } },
  { id: nextId("usr"), createdTime: "2026-08-31T09:00:00.000Z", fields: { Name: "Preview Marketing", Email: "preview.marketing@bathshack.com", PasswordHash: PREVIEW_PASSWORD_HASH, Role: "Marketing", Active: true, MustChangePassword: false } },
  { id: nextId("usr"), createdTime: "2026-08-31T09:00:00.000Z", fields: { Name: "Preview H&S", Email: "preview.hs@bathshack.com", PasswordHash: PREVIEW_PASSWORD_HASH, Role: "H&S", Active: true, MustChangePassword: false } },
  { id: nextId("usr"), createdTime: "2026-08-31T09:00:00.000Z", fields: { Name: "Preview Store Manager", Email: "preview.storemanager@bathshack.com", PasswordHash: PREVIEW_PASSWORD_HASH, Role: "Store Manager", Site: [siteByName("Boucher").id], Active: true, MustChangePassword: false } },
];

const submissions: Rec[] = [];
const answers: Rec[] = [];

const store: Record<string, Rec[]> = {
  [TABLES.SETTINGS]: settings,
  [TABLES.SHOWROOMS]: showrooms,
  [TABLES.POS_CATALOGUE]: posCatalogue,
  [TABLES.AUDITS]: audits,
  [TABLES.AUDIT_LINE_ITEMS]: auditLineItems,
  [TABLES.ACTIONS]: actions,
  [TABLES.POS_REQUESTS]: posRequests,
  [TABLES.USERS]: users,
  [TABLES.SITES]: sites,
  [TABLES.CHECKLIST_TEMPLATES]: checklistTemplates,
  [TABLES.TEMPLATE_QUESTIONS]: templateQuestions,
  [TABLES.ROSTERS]: rosters,
  [TABLES.SUBMISSIONS]: submissions,
  [TABLES.ANSWERS]: answers,
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

export function mockDeleteRecords(table: string, ids: string[]) {
  if (!store[table]) return Promise.resolve();
  store[table] = store[table].filter((r) => !ids.includes(r.id));
  return Promise.resolve();
}

// Preview-mode stand-in for lib/airtable.ts's uploadAttachment() - doesn't
// actually store file bytes anywhere (no blob storage in this mock layer),
// just records that an attachment "landed" on the field so the H&S
// Walkaround flow can be exercised end-to-end locally, including the
// photoUploadErrors path never firing. Finds the record across every table
// rather than requiring a table name, since callers (submitHSWalkaround)
// only have a record ID and field name at that point.
export function mockUploadAttachment(recordId: string, fieldIdOrName: string, file: { filename: string; contentType: string; base64: string }) {
  for (const table of Object.values(store)) {
    const rec = table.find((r) => r.id === recordId);
    if (rec) {
      const existing: any[] = rec.fields[fieldIdOrName] || [];
      rec.fields[fieldIdOrName] = [...existing, { id: nextId("att"), filename: file.filename, type: file.contentType, size: Math.round((file.base64.length * 3) / 4) }];
      return Promise.resolve();
    }
  }
  return Promise.resolve();
}
