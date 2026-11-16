"use client";
// Admin: switch a store on for the bay register and add its bay numbers (Round 28).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, card, input, muted } from "./ui";

export default function StoreSetup({ sites, setUp }: { sites: { id: string; name: string }[]; setUp: { id: string; name: string }[] }) {
  const router = useRouter();
  const [siteId, setSiteId] = useState("");
  const [code, setCode] = useState("");
  const [bayStore, setBayStore] = useState(setUp[0]?.id || "");
  const [labels, setLabels] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(body: object, ok: (b: any) => string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/bays/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? ok(b) : b.error || "Couldn't save.");
    if (res.ok) router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Add a store to the bay register</div>
        <select style={input} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Choose a store…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input style={{ ...input, marginTop: 8 }} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Bay code prefix, e.g. LUR" maxLength={5} />
        <div style={{ ...muted, marginTop: 4 }}>Printed on every bay label (LUR-01), so keep it short.</div>
        <button type="button" disabled={busy || !siteId || !code} style={{ ...btn, marginTop: 10 }} onClick={() => post({ siteId, code }, () => "Store added.")}>
          Add store
        </button>
      </div>
      {setUp.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Add bays</div>
          <select style={input} value={bayStore} onChange={(e) => setBayStore(e.target.value)}>
            {setUp.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <textarea style={{ ...input, marginTop: 8, minHeight: 60 }} value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="Bay numbers, e.g. 1-52 or 1, 2, 9a, 10a" />
          <button
            type="button"
            disabled={busy || !labels.trim()}
            style={{ ...btn, marginTop: 10 }}
            onClick={() => post({ siteId: bayStore, labels: expand(labels) }, (b) => `${b.added} bay(s) added.`)}
          >
            Add bays
          </button>
        </div>
      )}
      {msg && <div style={{ fontSize: 14 }}>{msg}</div>}
    </div>
  );
}

/** "1-5, 9a" -> "1 2 3 4 5 9a" */
function expand(s: string) {
  return s
    .split(/[\s,]+/)
    .flatMap((t) => {
      const m = t.match(/^(\d+)-(\d+)$/);
      if (!m) return [t];
      const [a, b] = [Number(m[1]), Number(m[2])];
      return b >= a && b - a < 200 ? Array.from({ length: b - a + 1 }, (_, i) => String(a + i)) : [t];
    })
    .join(" ");
}
