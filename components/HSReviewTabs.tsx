"use client";

import { useState } from "react";

type Tab = "Review" | "Showroom Scores" | "Key Dates";

// Salli, 9 Sep 2026: "For the Level of Concern... perhaps ANOTHER tab is
// needed - with Showroom Scores on it?" - both panels are rendered
// server-side by app/hs-review/page.tsx and handed in as children; this
// just toggles which one shows, the same lightweight pattern as
// ActionsTabs' All/POS/H&S tabs.
export default function HSReviewTabs({
  reviewContent,
  scoresContent,
  keyDatesContent,
}: {
  reviewContent: React.ReactNode;
  scoresContent: React.ReactNode;
  // Key Dates tab (Lorraine, 25 Sep 2026) - extinguisher service, fire drill
  // and first aid kit dates for every site on one screen.
  keyDatesContent?: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Review");

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee" }}>
        {((keyDatesContent ? ["Review", "Key Dates", "Showroom Scores"] : ["Review", "Showroom Scores"]) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #E6017E" : "2px solid transparent",
              color: tab === t ? "#E6017E" : "#6E6E6E",
              fontWeight: tab === t ? 600 : 500,
              fontSize: 14,
              padding: "10px 16px",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div hidden={tab !== "Review"}>{reviewContent}</div>
      <div hidden={tab !== "Showroom Scores"}>{scoresContent}</div>
      {keyDatesContent && <div hidden={tab !== "Key Dates"}>{keyDatesContent}</div>}
    </div>
  );
}
