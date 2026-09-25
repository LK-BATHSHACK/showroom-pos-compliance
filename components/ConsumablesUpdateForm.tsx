"use client";

import { useState } from "react";
import { compressImages, shrinkToFit, postFormData, formatMB, MAX_TOTAL_UPLOAD_BYTES } from "@/lib/clientUpload";
import type { UpdateView } from "@/components/ConsumablesUpdateSummary";

// Mirrors lib/consumables.ts's DELIVERY_METHODS (live DeliveryMethod field
// choices) - local copy so this client component doesn't import server code.
const DELIVERY_METHODS = ["Van drop", "DPD", "Post", "Other courier", "Collection"];
const MAX_PHOTOS = 5;

const inputStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, fontFamily: "inherit" };

// Chris/Operations' "Send update" panel for one request (Lorraine, 25 Sep
// 2026) - how many packages, how and roughly when it's arriving, a note, and
// a photo of the packed order. Sending emails the store and sets the request
// to "Sent".
export default function ConsumablesUpdateForm({
  requestId,
  siteName,
  requestedByName,
  hasEmail,
  existing,
  onDone,
  onCancel,
}: {
  requestId: string;
  siteName: string;
  requestedByName: string;
  hasEmail: boolean;
  existing: UpdateView | null;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const [packageCount, setPackageCount] = useState(existing?.packageCount ? String(existing.packageCount) : "");
  const [deliveryMethod, setDeliveryMethod] = useState(existing?.deliveryMethod || "");
  const [expectedDelivery, setExpectedDelivery] = useState(existing?.expectedDelivery || "");
  const [message, setMessage] = useState(existing?.message || "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function addPhotos(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    setPreparing(true);
    try {
      const shrunk = await compressImages(picked);
      setPhotos((prev) => {
        const combined = [...prev, ...shrunk];
        if (combined.length > MAX_PHOTOS) {
          setError(`Up to ${MAX_PHOTOS} photos - the extra ones weren't added.`);
          return combined.slice(0, MAX_PHOTOS);
        }
        setError("");
        return combined;
      });
    } finally {
      setPreparing(false);
    }
  }

  async function send() {
    setError("");
    if (!packageCount && !deliveryMethod && !expectedDelivery.trim() && !message.trim() && photos.length === 0) {
      setError("Add at least one detail before sending.");
      return;
    }
    setSending(true);
    const { groups, total } = await shrinkToFit({ p: photos });
    if (total > MAX_TOTAL_UPLOAD_BYTES) {
      setSending(false);
      setError(`Photos add up to ${formatMB(total)} - remove one or two and try again.`);
      return;
    }
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ packageCount, deliveryMethod, expectedDelivery, message }));
    groups.p.forEach((f) => fd.append("photo", f, f.name));
    const { ok, body } = await postFormData(`/api/consumables-request/${requestId}/update`, fd);
    setSending(false);
    if (!ok) {
      setError(body?.error || "Something went wrong.");
      return;
    }
    const photoNote = body.photoUploadErrors?.length ? ` (${body.photoUploadErrors.length} photo(s) didn't save)` : "";
    onDone(
      body.emailed
        ? `Update sent to ${requestedByName} at ${siteName}${photoNote}.`
        : `Update saved${photoNote}, but there's no email address on this request so nothing was emailed.`
    );
  }

  return (
    <div style={{ background: "#FFF5FA", border: "1px solid #F6C6DF", borderRadius: 8, padding: 14, margin: "4px 0 10px" }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>
        Send an update to {requestedByName} ({siteName})
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
          Packages
          <input type="number" min={0} max={999} value={packageCount} onChange={(e) => setPackageCount(e.target.value)} style={{ ...inputStyle, width: 90 }} placeholder="e.g. 2" />
        </label>
        <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
          Coming by
          <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} style={inputStyle}>
            <option value="">Choose...</option>
            {DELIVERY_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
          Roughly when
          <input value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} style={inputStyle} placeholder='e.g. "next week", "next day", "Thursday"' maxLength={200} />
        </label>
      </div>
      <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        Message (optional)
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={inputStyle} placeholder="e.g. On the van drop for next week - toner is on back order, will follow separately." maxLength={2000} />
      </label>
      <div style={{ fontSize: 13, marginBottom: 10 }}>
        <div style={{ marginBottom: 4 }}>Photo of the packages (optional, up to {MAX_PHOTOS})</div>
        <input type="file" accept="image/*" multiple onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {photos.map((f, i) => (
              <span key={i} style={{ background: "#fff", border: "1px solid #eee", borderRadius: 6, padding: "2px 8px" }}>
                {f.name}{" "}
                <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "#d03b3b", cursor: "pointer" }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {existing?.photos.length && photos.length === 0 ? (
          <div style={{ color: "#999", fontSize: 12, marginTop: 4 }}>The {existing.photos.length} photo(s) from the last update stay unless you add new ones.</div>
        ) : null}
      </div>
      {!hasEmail && <div style={{ color: "#966400", fontSize: 12, marginBottom: 8 }}>No email address on this request - the update will be saved and shown in the app, but not emailed.</div>}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={send}
          disabled={sending || preparing}
          style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", opacity: sending || preparing ? 0.6 : 1 }}
        >
          {sending ? "Sending..." : preparing ? "Preparing photos..." : existing ? "Send updated details" : "Send update & mark as Sent"}
        </button>
        <button type="button" onClick={onCancel} style={{ background: "none", border: "1px solid #ddd", borderRadius: 6, padding: "8px 14px", cursor: "pointer" }}>
          Cancel
        </button>
        {error && <span style={{ color: "#d03b3b", fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
