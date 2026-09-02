"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

const SHOWROOMS = ["Boucher", "Shore Rd.", "Dargan", "Antrim", "Lisburn", "Lurgan", "Ballymena",
  "Armagh", "Coleraine", "Cork", "Dublin", "Galway", "Manchester"];
const CATEGORIES = ["POS on Bays", "Sales POS", "Showroom Entrance", "Terminals",
  "Customer Bathrooms", "Toilets", "Showroom Branded Scent", "Other Signage"];

type RequestType = "New Idea" | "Replacement/Support Request";

export default function NewRequestPage() {
  const router = useRouter();
  const [requestType, setRequestType] = useState<RequestType>("New Idea");
  const [form, setForm] = useState({
    showroomName: "", requesterName: "", requesterEmail: "", ideaDescription: "",
    businessReason: "", customerProblemOpportunity: "", suggestedLocation: "",
    productCategory: "", urgency: "Medium", otherShowroomsMayBenefit: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/pos-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, requestType }),
    });
    setSubmitting(false);
    if (res.ok) {
      router.push("/requests");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong.");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, marginBottom: 14,
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" };
  const isNewIdea = requestType === "New Idea";

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Submit a POS Request</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 16 }}>
        Two different things live here, kept separate on purpose (31 Aug 2026): a brand-new concept nobody's tried
        yet, or needing more of / a fix to something that already exists.
      </p>

      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {(["New Idea", "Replacement/Support Request"] as RequestType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setRequestType(t)}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 6,
                border: requestType === t ? "2px solid #E6017E" : "1px solid #ddd",
                background: requestType === t ? "#FFF0F7" : "#fff",
                color: requestType === t ? "#E6017E" : "#333",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t === "New Idea" ? "New Idea" : "Replacement/Support"}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#6E6E6E", marginTop: -10, marginBottom: 18 }}>
          {isNewIdea
            ? "A POS concept that doesn't exist yet - all ideas welcome."
            : "Something that already exists but you need more of, or that's broken/missing and needs replacing."}
        </p>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Showroom</label>
          <select style={inputStyle} value={form.showroomName} onChange={(e) => set("showroomName", e.target.value)} required>
            <option value="">Select...</option>
            {SHOWROOMS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={labelStyle}>Your name</label>
          <input style={inputStyle} value={form.requesterName} onChange={(e) => set("requesterName", e.target.value)} />

          <label style={labelStyle}>Your email</label>
          <input style={inputStyle} type="email" value={form.requesterEmail} onChange={(e) => set("requesterEmail", e.target.value)} />

          <label style={labelStyle}>{isNewIdea ? "What's the idea?" : "What needs replacing or support?"}</label>
          <textarea style={{ ...inputStyle, minHeight: 70 }} value={form.ideaDescription} onChange={(e) => set("ideaDescription", e.target.value)} required />

          {isNewIdea && (
            <>
              <label style={labelStyle}>Why does it help (business reason)?</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.businessReason} onChange={(e) => set("businessReason", e.target.value)} />

              <label style={labelStyle}>What customer problem/opportunity does it address?</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.customerProblemOpportunity} onChange={(e) => set("customerProblemOpportunity", e.target.value)} />

              <label style={labelStyle}>Suggested location in showroom</label>
              <input style={inputStyle} value={form.suggestedLocation} onChange={(e) => set("suggestedLocation", e.target.value)} />
            </>
          )}

          <label style={labelStyle}>Product category</label>
          <select style={inputStyle} value={form.productCategory} onChange={(e) => set("productCategory", e.target.value)}>
            <option value="">Select...</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <label style={labelStyle}>Urgency</label>
          <select style={inputStyle} value={form.urgency} onChange={(e) => set("urgency", e.target.value)}>
            <option>Low</option><option>Medium</option><option>High</option>
          </select>

          {isNewIdea && (
            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.otherShowroomsMayBenefit} onChange={(e) => set("otherShowroomsMayBenefit", e.target.checked)} />
              Other showrooms might benefit from this too
            </label>
          )}

          {error && <div style={{ color: "#d03b3b", fontSize: 13, margin: "10px 0" }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}
          >
            {submitting ? "Submitting..." : isNewIdea ? "Submit Idea" : "Submit Request"}
          </button>
        </form>
      </Card>
    </div>
  );
}
