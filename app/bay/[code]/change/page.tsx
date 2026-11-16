import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBay, isIncoming } from "@/lib/bays/repo";
import { canChangeStore } from "@/lib/bays/access";
import ChangeForm from "@/components/bays/ChangeForm";
import { muted } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function ChangePage({ params }: { params: { code: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const data = await getBay(decodeURIComponent(params.code));
  if (!data || !canChangeStore(s, data.store.airtable_site_id)) notFound();
  const lines = data.lines.filter((l) => l.line_type === "Product" && !isIncoming(l)).map((l) => ({ id: l.id, sku: l.sku, description: l.description }));
  return (
    <div>
      <Link href={`/bay/${data.bay.bay_code}`} style={{ ...muted, textDecoration: "none" }}>← Bay {data.bay.label}</Link>
      <h1 style={{ fontSize: 24, margin: "6px 0 4px" }}>Change bay {data.bay.label}, {data.store.name}</h1>
      <p style={{ ...muted, marginTop: 0 }}>This replaces the WhatsApp message: the store gets it on their to-do list and confirms it with a photo.</p>
      <ChangeForm bayCode={data.bay.bay_code} lines={lines} storeRaised={s.role === "Store Manager"} />
    </div>
  );
}
