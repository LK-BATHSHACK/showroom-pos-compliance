"use client";

import { useState } from "react";
import { Card } from "@/components/ui";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-audit", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Something went wrong.");
      } else {
        setResult(body);
      }
    } catch (err: any) {
      setError(err.message || "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Submit an Audit</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        Upload one of: a completed Audit Intake Template - either the single-showroom version or
        Jordan's multi-tab round file (one tab per Group A showroom) - a Microsoft Forms export
        (every showroom's monthly self-report), or the Showrooms POS Spot Check NI/ROI tracker
        (Jordan's regular working file for his Group A/B rounds). The format is detected
        automatically.
      </p>

      <Card>
        <form onSubmit={handleSubmit}>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginBottom: 16, display: "block" }}
          />
          <button
            type="submit"
            disabled={!file || loading}
            style={{
              background: "#E6017E", color: "#fff", border: "none", borderRadius: 6,
              padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: file ? "pointer" : "not-allowed",
              opacity: file ? 1 : 0.5,
            }}
          >
            {loading ? "Processing..." : "Upload & Score"}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: 16, background: "#FDEAEA", color: "#d03b3b", padding: "10px 14px", borderRadius: 6, fontSize: 14 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 20, borderTop: "1px solid #eee", paddingTop: 16 }}>
            <p style={{ color: "#6E6E6E", fontSize: 13, marginTop: 0 }}>Detected format: {result.format}</p>

            {result.results?.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
                    <th style={{ padding: "6px 4px" }}>Showroom</th>
                    <th>Score</th>
                    <th>RAG</th>
                    <th>Actions created</th>
                    <th>Verified fixed</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r: any, i: number) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f2f2f2" }}>
                      <td style={{ padding: "6px 4px" }}>{r.showroom}</td>
                      <td>{r.score}/100</td>
                      <td>{r.rag}</td>
                      <td>{r.actionsCreated}</td>
                      <td>{r.actionsVerified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {result.errors?.length > 0 && (
              <div style={{ background: "#FDEAEA", color: "#d03b3b", padding: "10px 14px", borderRadius: 6, fontSize: 14, marginBottom: 12 }}>
                {result.errors.map((e: any, i: number) => (
                  <div key={i}>{e.showroom}: {e.error}</div>
                ))}
              </div>
            )}

            {result.newIdeasLogged > 0 && (
              <p style={{ fontSize: 13, color: "#6E6E6E" }}>
                {result.newIdeasLogged} new POS idea{result.newIdeasLogged === 1 ? "" : "s"} logged in POS Requests for review.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
