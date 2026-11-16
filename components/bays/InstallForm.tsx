"use client";
// The store confirms a change is in place: tick each item, take a new bay photo (Round 28).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, postFormData } from "@/lib/clientUpload";
import { btn, card, muted } from "./ui";

type Item = { id: string; label: string };

export default function InstallForm({ changeId, bayCode, items }: { changeId: string; bayCode: string; items: Item[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allTicked = items.every((i) => done[i.id]);

  async function submit() {
    if (!allTicked) return setError("Tick each change once it's done.");
    if (!photo) return setError("Take a photo of the finished bay.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("action", "install");
    fd.set("photo", await compressImage(photo));
    const { ok, body } = await postFormData(`/api/bays/changes/${changeId}`, fd);
    if (!ok) {
      setError(body?.error || "Couldn't save. Please try again.");
      return setBusy(false);
    }
    router.push(`/bay/${bayCode}?installed=1`);
    router.refresh();
  }

  return (
    <div style={{ ...card, display: "grid", gap: 12, maxWidth: 640 }}>
      <div style={{ fontWeight: 600 }}>Mark this change as done</div>
      {items.map((i) => (
        <label key={i.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 15 }}>
          <input type="checkbox" style={{ width: 22, height: 22 }} checked={!!done[i.id]} onChange={(e) => setDone({ ...done, [i.id]: e.target.checked })} />
          <span>{i.label}</span>
        </label>
      ))}
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Photo of the finished bay</div>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        <div style={muted}>Stand back so the whole bay is in the picture.</div>
      </div>
      {error && <div style={{ color: "#B00020", fontSize: 14 }}>{error}</div>}
      <div>
        <button type="button" onClick={submit} disabled={busy} style={btn}>
          {busy ? "Saving…" : "Confirm change is done"}
        </button>
      </div>
    </div>
  );
}
