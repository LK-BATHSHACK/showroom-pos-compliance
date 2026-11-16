// Ryan's bay desk (Round 28): store-raised changes to approve, differences
// found on checks, installs running late. Everything waiting on him in one list.
import Link from "next/link";
import { guardRole } from "@/lib/pageGuard";
import { deskData } from "@/lib/bays/repo";
import { BAY_DESK_ROLES } from "@/lib/bays/access";
import DeskButtons from "@/components/bays/DeskButtons";
import { card, muted, Section, dateText, Pill } from "@/components/bays/ui";

export const dynamic = "force-dynamic";

export default async function DeskPage() {
  await guardRole(BAY_DESK_ROLES);
  const d = await deskData();
  const desc = (c: (typeof d.awaiting)[number]) => c.items.map((i) => `${i.action} ${i.action === "Remove" ? i.oldDescription : i.newDescription}`).join("; ");
  const total = d.awaiting.length + d.exceptions.length;

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Bay desk</h1>
      <p style={{ ...muted, marginTop: 0 }}>{total ? `${total} item${total > 1 ? "s" : ""} waiting for you.` : "Nothing waiting for you."}</p>

      <Section title={`Store changes to approve (${d.awaiting.length})`}>
        {d.awaiting.length === 0 ? <div style={card}>None.</div> : d.awaiting.map((c) => (
          <div key={c.id} style={{ ...card, marginBottom: 8 }}>
            <Link href={`/bays/changes/${c.id}`} style={{ color: "inherit" }}><b>{c.bay_code}</b></Link> <span style={muted}>· {d.storeName(c.store_id)} · {c.raised_by}, {dateText(c.created_at)}</span>
            <div style={{ fontSize: 14, marginTop: 4 }}>{desc(c)}</div>
            {c.note && <div style={{ ...muted, marginTop: 4 }}>“{c.note}”</div>}
            <DeskButtons kind="change" id={c.id} />
          </div>
        ))}
      </Section>

      <Section title={`Differences and unknown items (${d.exceptions.length})`}>
        {d.exceptions.length === 0 ? <div style={card}>None.</div> : d.exceptions.map((e) => (
          <div key={e.id} style={{ ...card, marginBottom: 8 }}>
            <b>{e.kind}</b> <span style={muted}>· {e.store_id ? d.storeName(e.store_id) : ""} {e.bay_code ? <Link href={`/bay/${e.bay_code}`}>{e.bay_code}</Link> : null} · {dateText(e.opened_at)}</span>
            <div style={{ fontSize: 14, marginTop: 4 }}>{e.detail}</div>
            <DeskButtons kind="exception" id={e.id} />
          </div>
        ))}
        <div style={{ ...muted, marginTop: 4 }}>Fix the bay first (raise a change, or correct the Acumatica quote), then mark it resolved with a short note.</div>
      </Section>

      <Section title={`Installs running late (${d.overdue.length})`}>
        {d.overdue.length === 0 ? <div style={card}>None.</div> : d.overdue.map((c) => (
          <Link key={c.id} href={`/bays/changes/${c.id}`} style={{ ...card, display: "block", marginBottom: 8, textDecoration: "none", color: "inherit" }}>
            <b>{c.bay_code}</b> <span style={muted}>· {d.storeName(c.store_id)}</span> <Pill>Overdue</Pill>
            <div style={{ fontSize: 14, marginTop: 4 }}>{desc(c)} · due {dateText(c.due_at)}</div>
          </Link>
        ))}
      </Section>

      <Section title={`With stores, on time (${d.inProgress.length})`}>
        {d.inProgress.length === 0 ? <div style={card}>None.</div> : (
          <div style={card}>
            {d.inProgress.map((c) => (
              <div key={c.id} style={{ fontSize: 14, padding: "4px 0" }}>
                <Link href={`/bays/changes/${c.id}`}>{c.bay_code}</Link> <span style={muted}>· {d.storeName(c.store_id)} · due {dateText(c.due_at)}</span> · {desc(c)}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
