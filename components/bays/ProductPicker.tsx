"use client";
// Type part of a code or description, pick from the Acumatica product list (Round 28).
import { useEffect, useState } from "react";
import { input, muted } from "./ui";

export type Picked = { sku: string; description: string };

export default function ProductPicker({ onPick, placeholder }: { onPick: (p: Picked) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/bays/products?q=${encodeURIComponent(q)}`);
        const body = await res.json();
        setResults(body.products || []);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || "Search code or description"} />
      {busy && <div style={{ ...muted, marginTop: 6 }}>Searching…</div>}
      {!busy && q.trim().length >= 2 && results.length === 0 && <div style={{ ...muted, marginTop: 6 }}>No products found. Check the code, or ask Ryan.</div>}
      {results.length > 0 && (
        <div style={{ border: "1px solid #E6E6E6", borderRadius: 8, marginTop: 6, background: "#fff" }}>
          {results.map((p) => (
            <button
              key={p.sku}
              type="button"
              onClick={() => {
                onPick(p);
                setQ("");
                setResults([]);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #F0F0F0", cursor: "pointer", fontFamily: "inherit" }}
            >
              <div style={{ fontSize: 14 }}>{p.description}</div>
              <div style={muted}>{p.sku}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
