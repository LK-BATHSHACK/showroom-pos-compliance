import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBay, isIncoming } from "@/lib/bays/repo";
import { canCheckStore } from "@/lib/bays/access";
import CheckForm from "@/components/bays/CheckForm";
import { muted } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function CheckPage({ params, searchParams }: { params: { code: string }; searchParams: { monthly?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const data = await getBay(decodeURIComponent(params.code));
  if (!data || !canCheckStore(s, data.store.airtable_site_id)) notFound();
  // Items from a change that isn't installed yet aren't checked - they're not meant to be there yet.
  // Imported lines that are still Planned ARE checked: that's how the capture walk verifies them.
  const lines = data.lines.filter((l) => !isIncoming(l)).map((l) => ({ id: l.id, sku: l.sku, description: l.description, lineType: l.line_type }));
  return (
    <div>
      <Link href={`/bay/${data.bay.bay_code}`} style={{ ...muted, textDecoration: "none" }}>← Bay {data.bay.label}</Link>
      <h1 style={{ fontSize: 24, margin: "6px 0 4px" }}>Check bay {data.bay.label}</h1>
      <p style={{ ...muted, marginTop: 0 }}>Go through each item on display. Anything that doesn't match goes to Ryan; you don't need to fix the list yourself.</p>
      <CheckForm bayCode={data.bay.bay_code} lines={lines} kind={searchParams.monthly ? "Monthly" : "Capture"} />
    </div>
  );
}
