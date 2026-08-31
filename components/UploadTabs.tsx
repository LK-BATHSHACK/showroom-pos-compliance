"use client";

import { useState } from "react";
import POSWalkaroundForm from "@/components/POSWalkaroundForm";
import ExcelUploadPanel from "@/components/ExcelUploadPanel";

type ShowroomOption = { id: string; name: string };

// "Fill Out Checklist" is the default tab (31 Aug 2026 - Lorraine: "instead
// of having all the headings at the top ... add the questions to be
// populated and filled out in the tool"). "Upload File" stays for Jordan's
// Excel-based spot checks and is hidden entirely for Store Managers, who
// only ever fill out their own site's checklist in-tool.
export default function UploadTabs({
  showrooms,
  lockedShowroom,
  lockedShowroomError,
  submittedByName,
  showExcelTab,
}: {
  showrooms: ShowroomOption[];
  lockedShowroom: ShowroomOption | null;
  lockedShowroomError: string | null;
  submittedByName: string;
  showExcelTab: boolean;
}) {
  const [tab, setTab] = useState<"form" | "excel">("form");

  return (
    <div>
      {showExcelTab && (
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee" }}>
          <TabButton active={tab === "form"} onClick={() => setTab("form")}>Fill Out Checklist</TabButton>
          <TabButton active={tab === "excel"} onClick={() => setTab("excel")}>Upload File</TabButton>
        </div>
      )}

      {tab === "form" || !showExcelTab ? (
        <POSWalkaroundForm
          showrooms={showrooms}
          lockedShowroom={lockedShowroom}
          lockedShowroomError={lockedShowroomError}
          submittedByName={submittedByName}
        />
      ) : (
        <ExcelUploadPanel />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid #E6017E" : "2px solid transparent",
        color: active ? "#E6017E" : "#6E6E6E",
        fontWeight: active ? 600 : 500,
        fontSize: 14,
        padding: "10px 16px",
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}
