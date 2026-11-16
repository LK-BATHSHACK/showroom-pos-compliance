import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchSites } from "@/lib/hsSubmission";
import { listStores, listBays, storeTodo } from "@/lib/bays/repo";
import { isStoreLocked } from "@/lib/bays/access";
import StoreSetup from "@/components/bays/StoreSetup";
import { card, muted, btnQuiet, Pill, Section, dateText, PINK } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function BaysPage({ searchParams }: { searchParams: { store?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const stores = await listStores();
  const locked = isStoreLocked(s.role);
  const storeId = locked ? s.siteId : searchParams.store || stores[0]?.airtable_site_id;
  const store = stores.find((x) => x.airtable_site_id === storeId) || null;
  const [bays, todo] = store ? await Promise.all([listBays(store.airtable_site_id), storeTodo(store.airtable_site_id)]) : [[], []];
  const sites = s.role === "Admin" ? await fetchSites() : [];
  const overdue = (d: string | null) => !!d && d < new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Bays{store ? `: ${store.name}` : ""}</h1>
          <p style={{ ...muted, margin: 0 }}>What's on display in every bay, kept up to date by the store and Ryan.</p>
        </div>
        <Link href="/bays/locator" style={btnQuiet}>Find a product</Link>
      </div>

      {!locked && stores.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {stores.map((x) => (
            <Link key={x.airtable_site_id} href={`/bays?store=${x.airtable_site_id}`} style={{ ...btnQuiet, padding: "6px 12px", fontSize: 13, ...(x.airtable_site_id === storeId ? { borderColor: PINK, color: PINK } : {}) }}>
              {x.name}
            </Link>
          ))}
        </div>
      )}

      {!store && <div style={{ ...card, marginTop: 20 }}>{locked ? "Your store isn't on the bay register yet." : "No stores are on the bay register yet."}</div>}

      {store && todo.length > 0 && (
        <Section title={`To do in store (${todo.length})`}>
          <div style={{ display: "grid", gap: 8 }}>
            {todo.map((c) => (
              <Link key={c.id} href={`/bays/changes/${c.id}`} style={{ ...card, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>
                  <b>{c.bay_code}</b>: {c.items.map((i) => `${i.action}${i.newDescription ? ` ${i.newDescription}` : i.oldDescription ? ` ${i.oldDescription}` : ""}`).join("; ")}
                </span>
                <span style={{ whiteSpace: "nowrap" }}>{overdue(c.due_at) ? <Pill>Overdue</Pill> : <span style={muted}>by {dateText(c.due_at)}</span>}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {store && (
        <Section title={`${bays.length} bays`}>
          {bays.length === 0 ? (
            <div style={card}>No bays yet.{s.role === "Admin" ? " Add them below." : ""}</div>
          ) : (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {bays.map((b) => (
                <Link key={b.id} href={`/bay/${b.bay_code}`} style={{ ...card, padding: 0, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
                  <div style={{ height: 110, background: "#EFEFEF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {b.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.photoUrl} alt={`Bay ${b.label}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={muted}>No photo yet</span>
                    )}
                  </div>
                  <div style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>Bay {b.label}</div>
                    <div style={muted}>{b.lineCount} products</div>
                    <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>
                      {b.last_verified_at ? `Checked ${dateText(b.last_verified_at)}` : "Not checked yet"}
                    </div>
                    {b.openChanges > 0 && <div style={{ marginTop: 6 }}><Pill>With store</Pill></div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>
      )}

      {s.role === "Admin" && (
        <Section title="Set up (Admin)">
          <StoreSetup
            sites={sites.filter((x) => !stores.some((st) => st.airtable_site_id === x.id)).map((x) => ({ id: x.id, name: x.name }))}
            setUp={stores.map((x) => ({ id: x.airtable_site_id, name: x.name }))}
          />
        </Section>
      )}
    </div>
  );
}
