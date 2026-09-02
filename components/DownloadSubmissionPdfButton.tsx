"use client";

// PDF export for a single H&S Check submission (per Lorraine, 1 Sep 2026:
// "can we make the results download to pdf so if salli ever needs to do
// this she can"). Generated entirely client-side with jsPDF - no server
// endpoint, no headless-browser rendering, nothing to keep alive on
// Vercel - just draws the same answers already rendered on the page into a
// PDF and triggers a normal browser download.
//
// Deliberate simplification, flagged rather than silently done: this uses
// jsPDF's built-in Helvetica rather than embedding the brand's Poppins
// typeface (Poppins isn't a built-in PDF font - embedding it means bundling
// the actual .ttf and adding it to jsPDF's virtual filesystem, real extra
// weight for a document whose job is "an accurate readable record Salli can
// keep or forward", not a piece of marketing collateral). Still applies the
// brand palette (pink header band, black text, grey table striping) - see
// bathshack-brand-standards. Same trade-off the brand standards skill
// itself calls out for docx/pptx going somewhere Poppins won't render.
//
// Photos aren't embedded in the PDF (fetching each attachment's image
// client-side and re-encoding it into the PDF is real extra complexity for
// a "record of the answers" export) - any answer with a photo attached
// gets a "[photo attached - view online]" note instead, so nothing is
// silently dropped without a trace.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_PINK: [number, number, number] = [230, 1, 126];
const BRAND_BLACK: [number, number, number] = [0, 0, 0];
const BRAND_GREY: [number, number, number] = [239, 239, 239];

export type SubmissionPdfAnswer = {
  qnum: number | null;
  text: string;
  answerText: string;
  hasPhotos: boolean;
};

export type SubmissionPdfSection = {
  section: string;
  items: SubmissionPdfAnswer[];
};

export type SubmissionPdfProps = {
  siteName: string;
  submissionDate: string;
  completedByName: string;
  completedByEmail: string;
  status: string;
  sections: SubmissionPdfSection[];
};

// Exported (not just used internally) so DownloadStorePdfButton.tsx can
// draw several submissions' worth of pages into ONE combined jsPDF instance
// (Lorraine, 2 Sep 2026: "download PDF must be able to download individual
// results for each store" -> "one combined PDF per store, all its
// submissions") rather than each submission starting its own document -
// pass an existing `doc` in and this appends a new page before drawing,
// instead of creating a fresh one.
export function buildSubmissionPdf(props: SubmissionPdfProps, existingDoc?: jsPDF): jsPDF {
  const doc = existingDoc || new jsPDF({ unit: "pt", format: "a4" });
  if (existingDoc) doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(...BRAND_PINK);
  doc.rect(0, 0, pageWidth, 54, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Bathshack - H&S Check", 32, 34);

  doc.setTextColor(...BRAND_BLACK);
  doc.setFontSize(16);
  doc.text(`${props.siteName} - ${props.submissionDate}`, 32, 78);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Completed by ${props.completedByName} (${props.completedByEmail}) - ${props.status}`,
    32,
    94
  );

  let cursorY = 112;

  for (const section of props.sections) {
    if (cursorY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      cursorY = 40;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_PINK);
    doc.text(section.section || "General", 32, cursorY);
    cursorY += 6;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: 32, right: 32 },
      head: [["Q", "Question", "Answer"]],
      body: section.items.map((a) => [
        a.qnum ?? "",
        a.text,
        a.answerText || (a.hasPhotos ? "" : "No answer"),
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 6, valign: "top" },
      headStyles: { fillColor: BRAND_PINK, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: BRAND_GREY },
      columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 210 }, 2: { cellWidth: "auto" } },
      didParseCell: (data) => {
        // Append the "[photo attached]" note into the Answer cell text
        // rather than a 4th column, so the table stays readable.
        if (data.column.index === 2 && data.section === "body") {
          const item = section.items[data.row.index];
          if (item?.hasPhotos) {
            data.cell.text = [...data.cell.text, "[photo attached - view online for the image]"];
          }
        }
      },
    });

    cursorY = (doc as any).lastAutoTable.finalY + 18;
  }

  return doc;
}

export default function DownloadSubmissionPdfButton(props: SubmissionPdfProps) {
  function handleClick() {
    const doc = buildSubmissionPdf(props);
    const safeSite = props.siteName.replace(/[^a-z0-9]+/gi, "-");
    doc.save(`H&S Check - ${safeSite} - ${props.submissionDate}.pdf`);
  }

  return (
    <button
      onClick={handleClick}
      style={{
        background: "#fff",
        color: "#E6017E",
        border: "1px solid #E6017E",
        borderRadius: 6,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Download PDF
    </button>
  );
}
