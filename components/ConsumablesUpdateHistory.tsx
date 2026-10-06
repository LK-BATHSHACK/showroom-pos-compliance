// Every delivery update sent for one consumables request, newest first
// (Lorraine, 6 Oct 2026: "you can only leave one note, it overrides your
// previous note. any chance the history of that can stay?"). The latest
// update shows in full; earlier ones sit underneath in a small expandable
// list so the tables stay compact. Used on the Dashboard, the Store
// Manager's "Your requests" list and the open-order notice.

import ConsumablesUpdateSummary, { type UpdateView } from "@/components/ConsumablesUpdateSummary";

export default function ConsumablesUpdateHistory({ updates }: { updates: UpdateView[] }) {
  if (!updates.length) return null;
  const newestFirst = [...updates].reverse();
  const [latest, ...earlier] = newestFirst;
  return (
    <div>
      <ConsumablesUpdateSummary update={latest} />
      {earlier.length > 0 && (
        <details style={{ marginTop: 4, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "#6E6E6E" }}>
            {earlier.length === 1 ? "1 earlier update" : `${earlier.length} earlier updates`}
          </summary>
          <div style={{ opacity: 0.8 }}>
            {earlier.map((u, i) => (
              <ConsumablesUpdateSummary key={i} update={u} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
