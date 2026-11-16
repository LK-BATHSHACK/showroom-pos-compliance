"use client";
// Raise a display change on one bay (Round 28). Built for speed on a phone:
// pick what's happening, pick the product, send.
import { useState } from "react";
import { useRouter } from "next/navigation";
import ProductPicker, { type Picked } from "./ProductPicker";
import { btn, btnQuiet, card, input, muted } from "./ui";

type Line = { id: string; sku: string | null; description: string };
type Item = { action: "Add" | "Remove" | "Replace"; oldLineId: string | null; newSku: string | null; newDescription?: string; qty: number };

export default function ChangeForm({ bayCode, lines, storeRaised }: { bayCode: string; lines: Line[]; storeRaised: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState<Item>({ action: "Replace", oldLineId: null, newSku: null, qty: 1 });
  const [note, setNote] = useState("");
  const [needsOrder, setNeedsOrder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsOld = draft.action !== "Add";
  const needsNew = draft.action !== "Remove";
  const draftReady = (!needsOld || draft.oldLineId) && (!needsNew || draft.newSku);
  const lineName = (id: string | null) => lines.find((l) => l.id === id)?.description || "";

  function addDraft() {
    if (!draftReady) return;
    setItems([...items, draft]);
    setDraft({ action: draft.action, oldLineId: null, newSku: null, qty: 1 });
  }

  async function submit() {
    const all = draftReady ? [...items, draft] : items;
    if (!all.length) return setError("Add at least one change.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/bays/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bayCode, items: all, note, needsOrder }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save the change.");
      router.push(`/bay/${bayCode}?sent=${body.status === "Awaiting Ryan" ? "ryan" : "store"}`);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const tab = (a: Item["action"], label: string) => (
    <button type="button" onClick={() => setDraft({ action: a, oldLineId: null, newSku: null, qty: 1 })} style={draft.action === a ? { ...btn, flex: 1 } : { ...btnQuiet, flex: 1 }}>
      {label}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      {items.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>In this change</div>
          {items.map((i, k) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderTop: k ? "1px solid #F0F0F0" : "none" }}>
              <span style={{ fontSize: 14 }}>
                <b>{i.action}</b> {i.oldLineId ? lineName(i.oldLineId) : ""} {i.action === "Replace" ? "with " : ""}
                {i.newDescription || ""}
              </span>
              <button type="button" onClick={() => setItems(items.filter((_, x) => x !== k))} style={{ ...btnQuiet, padding: "4px 10px", fontSize: 12 }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", gap: 8 }}>
          {tab("Replace", "Swap a product")}
          {tab("Add", "Add")}
          {tab("Remove", "Take out")}
        </div>
        {needsOld && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{draft.action === "Replace" ? "Product coming out" : "Product to take out"}</div>
            <select style={input} value={draft.oldLineId || ""} onChange={(e) => setDraft({ ...draft, oldLineId: e.target.value || null })}>
              <option value="">Choose from this bay…</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.description}
                  {l.sku ? ` (${l.sku})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {needsNew && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{draft.action === "Replace" ? "Product going in" : "Product to add"}</div>
            {draft.newSku ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <span>
                  {draft.newDescription} <span style={muted}>({draft.newSku})</span>
                </span>
                <button type="button" style={{ ...btnQuiet, padding: "4px 10px", fontSize: 12 }} onClick={() => setDraft({ ...draft, newSku: null, newDescription: undefined })}>
                  Change
                </button>
              </div>
            ) : (
              <ProductPicker onPick={(p: Picked) => setDraft({ ...draft, newSku: p.sku, newDescription: p.description })} />
            )}
            <label style={{ ...muted, display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              Qty
              <input type="number" min={1} max={20} value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: Math.max(1, Number(e.target.value) || 1) })} style={{ ...input, width: 80 }} />
            </label>
          </div>
        )}
        <button type="button" onClick={addDraft} disabled={!draftReady} style={{ ...btnQuiet, marginTop: 14, opacity: draftReady ? 1 : 0.5 }}>
          + Add another change to this bay
        </button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Note for the store (optional)</div>
        <textarea style={{ ...input, minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mirror arrives Thursday, hang it 10cm higher than the old one" />
        {!storeRaised && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 14 }}>
            <input type="checkbox" checked={needsOrder} onChange={(e) => setNeedsOrder(e.target.checked)} /> New stock needs ordering for this change
          </label>
        )}
        {storeRaised && <p style={{ ...muted, marginBottom: 0 }}>Ryan will approve this before it goes on the store's to-do list.</p>}
      </div>

      {error && <div style={{ color: "#B00020", fontSize: 14 }}>{error}</div>}
      <div>
        <button type="button" onClick={submit} disabled={busy} style={btn}>
          {busy ? "Sending…" : storeRaised ? "Send to Ryan for approval" : "Send change to the store"}
        </button>
      </div>
    </div>
  );
}
