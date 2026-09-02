"use client";

// PDF export for the (optionally filtered) H&S submissions log on
// /hs-review - see DownloadSubmissionPdfButton.tsx for the shared
// reasoning (client-side jsPDF, brand palette without embedding Poppins,
// no server round-trip).

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_PINK: [number, number, number] = [230, 1, 126];
const BRAND_GREY: [number, number, number] = [239, 239, 239];

export type LogPdfRow = {
  site: string;
  date: string;
  completedBy: string;
  status: string;
};

export type LogPdfProps = {
  rows: LogPdfRow[];
  filterDescription: string; // e.g. "Boucher - September 2026" or "All sites - all time"
};

export default function DownloadLogPdfButton({ rows, filterDescription }: LogPdfProps) {
  function handleClick() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(...BRAND_PINK);
    doc.rect(0, 0, pageWidth, 54, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Bathshack - H&S Check Log", 32, 34);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(filterDescription, 32, 74);
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(`${rows.length} submission${rows.length === 1 ? "" : "s"} - generated ${new Date().toLocaleDateString("en-GB")}`, 32, 88);

    autoTable(doc, {
      startY: 102,
      margin: { left: 32, right: 32 },
      head: [["Site", "Date", "Completed by", "Status"]],
      body: rows.map((r) => [r.site, r.date, r.completedBy, r.status]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: BRAND_PINK, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: BRAND_GREY },
    });

    const safeFilter = filterDescription.replace(/[^a-z0-9]+/gi, "-");
    doc.save(`H&S Check Log - ${safeFilter}.pdf`);
  }

  return (
    <button
      onClick={handleClick}
      disabled={rows.length === 0}
      style={{
        background: rows.length === 0 ? "#ccc" : "#fff",
        color: rows.length === 0 ? "#fff" : "#E6017E",
        border: `1px solid ${rows.length === 0 ? "#ccc" : "#E6017E"}`,
        borderRadius: 6,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: rows.length === 0 ? "not-allowed" : "pointer",
      }}
    >
      Download PDF
    </button>
  );
}
