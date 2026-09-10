"use client";

import { useState } from "react";

type TabDef = { key: string; label: string; content: React.ReactNode };

// Which tabs show up depends on role (decided server-side by
// app/consumables/page.tsx and passed in here) - Store Manager only ever
// gets one tab ("Request"), Operations only gets one ("Dashboard"), Admin/
// Marketing get both. No tab bar at all if there's only one to show.
export default function ConsumablesTabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.key);

  if (tabs.length <= 1) {
    return <>{tabs[0]?.content}</>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: active === t.key ? "2px solid #E6017E" : "2px solid transparent",
              color: active === t.key ? "#E6017E" : "#6E6E6E",
              fontWeight: active === t.key ? 600 : 500,
              fontSize: 14,
              padding: "10px 16px",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
