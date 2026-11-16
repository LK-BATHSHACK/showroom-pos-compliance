"use client";
// Check a bay against the register (Round 28): tick each line, add anything
// on display that isn't listed, take a photo. Differences go to Ryan.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, postFormData } from "@/lib/clientUpload";
import ProductPicker from "./ProductPicker";
import { btn, btnQuiet, card, input, muted } from "./ui";

type Line = { id: string; sku: string | null; description: string; lineType: string };
type Res = "Present" | "Missing" | "Different";

export default function CheckForm({ bayCode, lines, kind }: { bayCode: string; lines: Line[]; kind: "Capture" | "Monthly" }) {
  const router = useRouter();
  const [res, setRes] = useState<Record<string, { result: Res; note: string }>>({});
  const [added, setAdded] = useState<{ sku: string | null; text: string }[]>([]);
  const [unknownText, setUnknownText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = lines.filter((l) => !res[l.id]).length;

  const set = (id: string, result: Res) => setRes({ ...res, [id]: { result, note: res[id]?.note || "" } });
  const choice = (id: string, r: Res, label: string) => (
    <button type="button" onClick={() => set(id, r)} style={res[id]?.result === r ? { ...btn, padding: "8px 12px", fontSize: 13 } : { ...btnQuiet, padding: "8px 12px", fontSize: 13 }}>
      {label}
    </button>
  );

  async function submit() {
    if (left) return setError(`${left} line${left > 1 ? "s" : ""} still to tick.`);
    if (!photo) return setError("Take a photo of the bay.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("bayCode", bayCode);
    fd.set("kind", kind);
    fd.set("results", JSON.stringify(lines.map((l) => ({ lineId: l.id, result: res[l.id].result, note: res[l.id].note }))));
    fd.set("added", JSON.stringify(added));
    fd.set("photo", await compressImage(photo));
    const { ok, body } = await postFormData("/api/bays/check", fd);
    if (!ok) {
      setError(body?.error || "Couldn't save. Please try again.");
      return setBusy(false);
    }
    router.push(`/bay/${bayCode}?checked=${body.differences || 0}`);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
      {lines.map((l) => (
        <div key={l.id} style={card}>
          <div style={{ fontSize: 15 }}>{l.description}</div>
          <div style={muted}>{l.lineType === "Prop" ? "Styling prop" : l.sku}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {choice(l.id, "Present", "It's here")}
            {choice(l.id, "Missing", "Not here")}
            {choice(l.id, "Different", "Something different")}
          </div>
          {res[l.id] && res[l.id].result !== "Present" && (
            <input
              style={{ ...input, marginTop: 10 }}
              placeholder={res[l.id].result === "Missing" ? "Anything to add? (optional)" : "What's there instead?"}
              value={res[l.id].note}
              onChange={(e) => setRes({ ...res, [l.id]: { ...res[l.id], note: e.target.value } })}
            />
          )}
        </div>
      ))}

      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>On display but not listed above?</div>
        {added.map((a, k) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
            <span>{a.text}{a.sku ? ` (${a.sku})` : ""}</span>
            <button type="button" style={{ ...btnQuiet, padding: "2px 8px", fontSize: 12 }} onClick={() => setAdded(added.filter((_, x) => x !== k))}>Remove</button>
          </div>
        ))}
        <ProductPicker onPick={(p) => setAdded([...added, { sku: p.sku, text: p.description }])} placeholder="Search for it by code or name" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input style={input} value={unknownText} onChange={(e) => setUnknownText(e.target.value)} placeholder="Can't find it? Describe it instead" />
          <button type="button" style={btnQuiet} onClick={() => { if (unknownText.trim()) { setAdded([...added, { sku: null, text: unknownText.trim() }]); setUnknownText(""); } }}>Add</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Photo of the whole bay</div>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
      </div>
      {error && <div style={{ color: "#B00020", fontSize: 14 }}>{error}</div>}
      <div>
        <button type="button" onClick={submit} disabled={busy} style={btn}>
          {busy ? "Saving…" : left ? `Submit check (${left} to tick)` : "Submit check"}
        </button>
      </div>
    </div>
  );
}
