"use client";

// "Download all PDF for <store>" - one combined PDF containing every H&S
// Check that store has ever submitted, full Q&A for each (Lorraine, 2 Sep
// 2026, after asking for per-submission PDFs: "also download PDF must be
// able to download individual results for each store" - clarified via
// follow-up as "One combined PDF per store (all its submissions)", not a
// row-level single-submission button, which DownloadSubmissionPdfButton.tsx
// already covers on /hs-review/[id]).
//
// Reuses buildSubmissionPdf (same file as the single-submission button) so
// each submission renders identically whether it's downloaded alone or as
// one section of this combined file - just drawn onto the same jsPDF
// instance, one submission per page-break, instead of each starting a new
// document.

import jsPDF from "jspdf";
import { buildSubmissionPdf, type SubmissionPdfProps } from "./DownloadSubmissionPdfButton";

export type StorePdfSubmission = Omit<SubmissionPdfProps, "siteName">;

export type StorePdfProps = {
  siteName: string;
  submissions: StorePdfSubmission[]; // expected oldest-first so the PDF reads chronologically
};

export default function DownloadStorePdfButton({ siteName, submissions }: StorePdfProps) {
  function handleClick() {
    let doc: jsPDF | undefined;
    submissions.forEach((s) => {
      doc = buildSubmissionPdf({ ...s, siteName }, doc);
    });
    if (!doc) return;
    const safeSite = siteName.replace(/[^a-z0-9]+/gi, "-");
    doc.save(`H&S Check - ${safeSite} - all submissions.pdf`);
  }

  return (
    <button
      onClick={handleClick}
      disabled={submissions.length === 0}
      title={submissions.length === 0 ? "No submissions for this site yet." : `${submissions.length} submission${submissions.length === 1 ? "" : "s"} in this PDF`}
      style={{
        background: submissions.length === 0 ? "#ccc" : "#fff",
        color: submissions.length === 0 ? "#fff" : "#E6017E",
        border: `1px solid ${submissions.length === 0 ? "#ccc" : "#E6017E"}`,
        borderRadius: 6,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: submissions.length === 0 ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      Download all-time PDF for {siteName}
    </button>
  );
}
