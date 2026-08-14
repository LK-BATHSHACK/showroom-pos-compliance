import { listRecords, TABLES } from "./airtable";

export type Settings = {
  GroupB_ReminderLeadDays: number;
  Escalation_ToRegionalManager_Days: number;
  Escalation_ToMarketing_Days: number;
  SLA_Critical_Days: number;
  SLA_High_Days: number;
  SLA_Medium_Days: number;
  SLA_Low_Days: number;
  GreenThreshold: number;
  AmberThreshold: number;
};

const DEFAULTS: Settings = {
  GroupB_ReminderLeadDays: 2,
  Escalation_ToRegionalManager_Days: 5,
  Escalation_ToMarketing_Days: 10,
  SLA_Critical_Days: 3,
  SLA_High_Days: 7,
  SLA_Medium_Days: 14,
  SLA_Low_Days: 30,
  GreenThreshold: 90,
  AmberThreshold: 70,
};

let cache: { value: Settings; fetchedAt: number } | null = null;
const CACHE_MS = 60_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.value;

  const records = await listRecords<{ SettingName: string; SettingValue: number }>(TABLES.SETTINGS);
  const values: Partial<Settings> = {};
  for (const r of records) {
    const key = r.fields.SettingName as keyof Settings;
    if (key in DEFAULTS) values[key] = Number(r.fields.SettingValue);
  }
  const merged = { ...DEFAULTS, ...values };
  cache = { value: merged, fetchedAt: Date.now() };
  return merged;
}

export function slaForPriority(settings: Settings, priority: "Critical" | "High" | "Medium" | "Low"): number {
  switch (priority) {
    case "Critical": return settings.SLA_Critical_Days;
    case "High": return settings.SLA_High_Days;
    case "Medium": return settings.SLA_Medium_Days;
    case "Low": return settings.SLA_Low_Days;
  }
}
