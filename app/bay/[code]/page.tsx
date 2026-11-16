// One bay - the page the QR label opens (Round 28).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getBay } from "@/lib/bays/repo";
import { canSeeStore, canChangeStore, canCheckStore } from "@/lib/bays/access";
import { card, muted, btn, btnQuiet, Pill, Section, money, dateText } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function BayPage({ params, searchParams }: { params: { code: string }; searchParams: Record<string, string> }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const data = await getBay(decodeURIComponent(params.code));
  if (!data || !canSeeStore(s, data.store.airtable_site_id)) notFound();
  const { bay, store, lines, openChanges, recentChanges, exceptions, photoUrl, photoTakenAt, events } = data;
  const products = lines.filter((l) => l.line_type === "Product");
  const props = lines.filter((l) => l.line_type !== "Product");

  const banner = searchParams.sent === "ryan" ? "Sent to Ryan for approval." : searchParams.sent ? "Change sent to the store." : searchParams.installed ? "Change marked as done. Thanks!" : searchParams.checked !== undefined ? (searchParams.checked === "0" ? "Check saved: everything matches." : `Check saved. ${searchParams.checked} difference(s) sent to Ryan.`) : null;

  return (
    <div>
      {banner && <div style={{ ...card, background: "#E5F4E4", borderColor: "#BFE3BD", marginBottom: 16 }}>{banner}</div>}
      <Link href={`/bays?store=${store.airtable_site_id}`} style={{ ...muted, textDecoration: "none" }}>← {store.name}</Link>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 6 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Bay {bay.label}</h1>
          <div style={muted}>
            {bay.bay_code} · {bay.last_verified_at ? `Last checked ${dateText(bay.last_verified_at)} by ${bay.last_verified_by}` : "Not checked yet"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canCheckStore(s, store.airtable_site_id) && <Link href={`/bay/${bay.bay_code}/check`} style={btn}>Check this bay</Link>}
          {canChangeStore(s, store.airtable_site_id) && <Link href={`/bay/${bay.bay_code}/change`} style={btnQuiet}>Raise a change</Link>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginTop: 16 }}>
        <div style={{ ...card, padding: 0, overflow: "hidden", minHeight: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "#EFEFEF" }}>
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={`Bay ${bay.label}`} style={{ width: "100%", display: "block" }} />
          ) : (
            <span style={muted}>No photo yet: one is taken on the next check.</span>
          )}
        </div>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {openChanges.map((c) => (
            <Link key={c.id} href={`/bays/changes/${c.id}`} style={{ ...card, textDecoration: "none", color: "inherit", borderColor: "#F2C6DE" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <b>Change in progress</b> <Pill>{c.status}</Pill>
              </div>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                {c.items.map((i) => (
                  <div key={i.id}>
                    {i.action}: {i.oldDescription ? `${i.oldDescription}${i.action === "Replace" ? " → " : ""}` : ""}
                    {i.action !== "Remove" ? i.newDescription : ""}
                  </div>
                ))}
              </div>
              <div style={{ ...muted, marginTop: 6 }}>Raised by {c.raised_by} {c.due_at ? `· due ${dateText(c.due_at)}` : ""}</div>
            </Link>
          ))}
          {exceptions.length > 0 && (
            <div style={card}>
              <b>Waiting for Ryan</b>
              {exceptions.map((e) => (
                <div key={e.id} style={{ fontSize: 14, marginTop: 6 }}>{e.kind}: {e.detail}</div>
              ))}
            </div>
          )}
          {photoTakenAt && <div style={muted}>Photo taken {dateText(photoTakenAt)}</div>}
        </div>
      </div>

      <Section title={`Products (${products.length})`}>
        <div style={{ ...card, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#FAFAFA" }}>
                <th style={{ padding: 10 }}>Product</th>
                <th style={{ padding: 10 }}>Code</th>
                <th style={{ padding: 10, textAlign: "right" }}>Now</th>
                <th style={{ padding: 10 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid #F0F0F0" }}>
                  <td style={{ padding: 10 }}>
                    {l.description}
                    {l.qty > 1 ? ` × ${l.qty}` : ""}
                    {l.itemStatus && l.itemStatus !== "Active" ? <div style={{ color: "#9B2C2C", fontSize: 12 }}>Acumatica status: {l.itemStatus}</div> : null}
                  </td>
                  <td style={{ padding: 10, ...muted }}>{l.sku}</td>
                  <td style={{ padding: 10, textAlign: "right", whiteSpace: "nowrap" }}>
                    {l.price ? (
                      <>
                        {l.price.was != null && <div style={{ ...muted, textDecoration: "line-through", fontSize: 12 }}>{money(l.price.was, l.price.currency)}</div>}
                        <b>{money(l.price.now, l.price.currency)}</b>
                        {l.price.unit === "m2" ? <span style={muted}> /m²</span> : null}
                      </>
                    ) : (
                      <span style={muted}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 10 }}><Pill>{l.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ ...muted, marginTop: 6 }}>Prices include VAT and come from Acumatica. Planned items are on their way in.</div>
      </Section>

      {props.length > 0 && (
        <Section title="Styling and notes">
          <div style={card}>
            {props.map((l) => (
              <div key={l.id} style={{ fontSize: 14, padding: "3px 0" }}>{l.description} <span style={muted}>({l.line_type === "Prop" ? "not for sale" : l.line_type.toLowerCase()})</span></div>
            ))}
          </div>
        </Section>
      )}

      <Section title="History">
        <div style={card}>
          {[...recentChanges.map((c) => ({ at: c.installed_at || c.decided_at || c.created_at, text: `Change ${c.status.toLowerCase()} (raised by ${c.raised_by})` })), ...events.map((e) => ({ at: e.at, text: `${e.action}${e.actor ? ` · ${e.actor}` : ""}` }))]
            .sort((a, b) => (a.at < b.at ? 1 : -1))
            .slice(0, 12)
            .map((h, k) => (
              <div key={k} style={{ fontSize: 14, padding: "4px 0", display: "flex", gap: 12 }}>
                <span style={{ ...muted, minWidth: 96 }}>{dateText(h.at)}</span>
                <span>{h.text}</span>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}
