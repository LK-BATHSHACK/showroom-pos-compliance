"use client";
// Ryan's one-tap actions on the bay desk (Round 28). Inline note box, no browser dialogs.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { btn, btnQuiet, input } from "./ui";

type Props =
  | { kind: "change"; id: string }
  | { kind: "exception"; id: string };

export default function DeskButtons(p: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "a" | "b">(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labels = p.kind === "change" ? ["Approve", "Reject"] : ["Resolved", "Dismiss"];

  async function go(which: "a" | "b") {
    setBusy(true);
    setError(null);
    const url = p.kind === "change" ? `/api/bays/changes/${p.id}` : `/api/bays/exceptions/${p.id}`;
    const payload = p.kind === "change" ? { action: which === "a" ? "approve" : "reject", note } : { note, dismiss: which === "b" };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Couldn't save.");
      return setBusy(false);
    }
    router.refresh();
  }

  if (open) {
    const needNote = (p.kind === "change" && open === "b") || (p.kind === "exception" && open === "a");
    return (
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        <input style={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder={needNote ? "Why / what was done (required)" : "Note (optional)"} />
        {error && <div style={{ color: "#B00020", fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={busy || (needNote && !note.trim())} onClick={() => go(open)} style={{ ...btn, padding: "8px 12px", fontSize: 13, opacity: needNote && !note.trim() ? 0.5 : 1 }}>
            {busy ? "Saving…" : `Confirm: ${open === "a" ? labels[0] : labels[1]}`}
          </button>
          <button type="button" onClick={() => setOpen(null)} style={{ ...btnQuiet, padding: "8px 12px", fontSize: 13 }}>Back</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button type="button" onClick={() => setOpen("a")} style={{ ...btn, padding: "8px 12px", fontSize: 13 }}>{labels[0]}</button>
      <button type="button" onClick={() => setOpen("b")} style={{ ...btnQuiet, padding: "8px 12px", fontSize: 13 }}>{labels[1]}</button>
    </div>
  );
}
