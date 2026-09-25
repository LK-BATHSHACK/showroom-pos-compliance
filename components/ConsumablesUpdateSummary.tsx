// Shows the delivery update Chris/Operations sent for a consumables request
// (packages, how it's coming, timing, message, photos). Used on both the
// Dashboard and the Store Manager's "Your requests" list.

export type UpdateView = {
  message: string | null;
  deliveryMethod: string | null;
  expectedDelivery: string | null;
  packageCount: number | null;
  photos: { url: string; thumbUrl: string; filename: string }[];
  sentByName: string | null;
  sentDate: string | null;
};

export default function ConsumablesUpdateSummary({ update }: { update: UpdateView }) {
  const facts: string[] = [];
  if (update.packageCount) facts.push(`${update.packageCount} package${update.packageCount === 1 ? "" : "s"}`);
  if (update.deliveryMethod) facts.push(update.deliveryMethod);
  if (update.expectedDelivery) facts.push(update.expectedDelivery);
  return (
    <div style={{ background: "#F7F7FA", borderRadius: 8, padding: "8px 10px", marginTop: 6, fontSize: 13 }}>
      {facts.length > 0 && <div style={{ fontWeight: 600 }}>{facts.join(" · ")}</div>}
      {update.message && <div style={{ whiteSpace: "pre-wrap", marginTop: facts.length ? 2 : 0 }}>{update.message}</div>}
      {update.photos.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {update.photos.map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noreferrer" title={p.filename}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumbUrl} alt={p.filename} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e5e5" }} />
            </a>
          ))}
        </div>
      )}
      {(update.sentByName || update.sentDate) && (
        <div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>
          Update sent{update.sentByName ? ` by ${update.sentByName}` : ""}
          {update.sentDate ? ` - ${update.sentDate}` : ""}
        </div>
      )}
    </div>
  );
}
