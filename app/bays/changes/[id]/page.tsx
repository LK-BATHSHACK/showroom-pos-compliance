import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getChange, getStore } from "@/lib/bays/repo";
import { canSeeStore, canCheckStore, isDeskRole } from "@/lib/bays/access";
import InstallForm from "@/components/bays/InstallForm";
import DeskButtons from "@/components/bays/DeskButtons";
import { card, muted, Pill, dateText } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function ChangeDetail({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const c = await getChange(params.id);
  if (!c || !canSeeStore(s, c.store_id)) notFound();
  const store = await getStore(c.store_id);
  const label = (i: (typeof c.items)[number]) =>
    i.action === "Add" ? `Add ${i.newDescription} (${i.new_sku})${i.qty > 1 ? ` × ${i.qty}` : ""}` : i.action === "Remove" ? `Take out ${i.oldDescription}` : `Swap ${i.oldDescription} for ${i.newDescription} (${i.new_sku})`;

  return (
    <div style={{ maxWidth: 680 }}>
      <Link href={`/bay/${c.bay_code}`} style={{ ...muted, textDecoration: "none" }}>← Bay {c.bay_code}</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 6 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Change to {c.bay_code}</h1>
        <Pill>{c.status}</Pill>
      </div>
      <div style={muted}>{store?.name} · raised by {c.raised_by} on {dateText(c.created_at)}{c.due_at ? ` · due ${dateText(c.due_at)}` : ""}</div>

      <div style={{ ...card, marginTop: 16 }}>
        {c.items.map((i) => (
          <div key={i.id} style={{ fontSize: 15, padding: "4px 0" }}>{label(i)}{i.seen_on_quote_at ? <span style={muted}> · on the Acumatica quote</span> : null}</div>
        ))}
        {c.note && <div style={{ marginTop: 10, fontSize: 14 }}><b>Note:</b> {c.note}</div>}
        {c.needs_order && <div style={{ ...muted, marginTop: 6 }}>New stock is being ordered.</div>}
        {c.decision_note && <div style={{ ...muted, marginTop: 6 }}>{c.decided_by}: {c.decision_note}</div>}
        {c.installed_at && <div style={{ ...muted, marginTop: 6 }}>Done by {c.installed_by} on {dateText(c.installed_at)}</div>}
      </div>

      {c.status === "Awaiting Ryan" && isDeskRole(s) && (
        <div style={{ ...card, marginTop: 12 }}>
          <b>Approve this store-raised change?</b>
          <DeskButtons kind="change" id={c.id} />
        </div>
      )}
      {c.status === "Awaiting Ryan" && !isDeskRole(s) && <p style={muted}>Waiting for Ryan to approve.</p>}
      {c.status === "With store" && canCheckStore(s, c.store_id) && (
        <div style={{ marginTop: 12 }}>
          <InstallForm changeId={c.id} bayCode={c.bay_code} items={c.items.map((i) => ({ id: i.id, label: label(i) }))} />
        </div>
      )}
    </div>
  );
}
