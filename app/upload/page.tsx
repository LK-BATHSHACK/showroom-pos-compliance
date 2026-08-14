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
        Upload a completed "Audit Intake Template.xlsx" - don't rename sheets or reorder rows, the
        upload matches on the exact layout.
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
            <h3 style={{ marginTop: 0 }}>{result.showroom}</h3>
            <p>
              Score: <strong>{result.score}/100</strong> &nbsp;
              RAG: <strong>{result.rag}</strong> &nbsp;
              Actions created: <strong>{result.actionsCreated}</strong>
            </p>
            {result.breakdown?.overrideApplied && (
              <p style={{ color: "#d03b3b" }}>
                Note: a critical item issue capped this score at {75}, regardless of the raw total ({result.breakdown.rawTotal}).
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
