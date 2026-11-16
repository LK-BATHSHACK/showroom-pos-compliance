// Product locator (Round 28): which showrooms and bays have a product on display.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { locate } from "@/lib/bays/repo";
import { isStoreLocked } from "@/lib/bays/access";
import { card, muted, input, btn, Pill } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function LocatorPage({ searchParams }: { searchParams: { q?: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  const q = (searchParams.q || "").slice(0, 80);
  const hits = q.trim().length >= 2 ? await locate(q, isStoreLocked(s.role) ? s.siteId : null) : [];

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Find a product</h1>
      <p style={{ ...muted, marginTop: 0 }}>Search by code or description to see which showrooms have it on display{isStoreLocked(s.role) ? " in your store" : ""}.</p>
      <form method="get" style={{ display: "flex", gap: 8, maxWidth: 560 }}>
        <input name="q" defaultValue={q} style={input} placeholder="e.g. oak vanity 1200, or a product code" />
        <button style={btn}>Search</button>
      </form>
      {q && hits.length === 0 && <div style={{ ...card, marginTop: 16 }}>No matching products.</div>}
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {hits.map((h) => (
          <div key={h.product.sku} style={card}>
            <div style={{ fontWeight: 600 }}>{h.product.description}</div>
            <div style={muted}>{h.product.sku}</div>
            {h.places.length === 0 ? (
              <div style={{ ...muted, marginTop: 6 }}>Not on display anywhere on the register.</div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {h.places.map((p) => (
                  <Link key={p.bay.id} href={`/bay/${p.bay.bay_code}`} style={{ border: "1px solid #E6E6E6", borderRadius: 8, overflow: "hidden", width: 150, textDecoration: "none", color: "inherit" }}>
                    <div style={{ height: 90, background: "#EFEFEF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ ...muted, fontSize: 12 }}>No photo</span>}
                    </div>
                    <div style={{ padding: 8, fontSize: 13 }}>
                      <b>{p.store.name}</b>
                      <div>Bay {p.bay.label}</div>
                      <div style={{ marginTop: 4 }}><Pill>{p.status}</Pill></div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
