"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { SITE_TYPES, REGIONS, AUDIT_GROUPS, HS_VERSIONS, HS_VERSION_LABELS, type HSVersion } from "@/lib/siteConfig";

// Stores admin (Round 26, Oct 2026). Lorraine: "Need to be able to add more
// stores and map to what view they should have. For example we want to add
// cookstown and have them fill out a warehouse version of the h&s check -
// they don't need to do POS."

type StoreRow = {
  id: string;
  name: string;
  siteType: string | null;
  region: string | null;
  auditGroup: string | null;
  active: boolean;
  pos: boolean;
  hs: boolean;
  hsVersion: HSVersion;
  showroomName: string | null;
  storeManagers: string[];
};

type StoreForm = {
  name: string;
  siteType: string;
  region: string;
  auditGroup: string;
  active: boolean;
  pos: boolean;
  hs: boolean;
  hsVersion: HSVersion;
};

const EMPTY_FORM: StoreForm = { name: "", siteType: "Showroom", region: "NI", auditGroup: "Group B", active: true, pos: true, hs: true, hsVersion: "Showroom" };

function formFrom(s: StoreRow): StoreForm {
  return {
    name: s.name,
    siteType: s.siteType || "Showroom",
    region: s.region || "NI",
    auditGroup: s.auditGroup || "Group B",
    active: s.active,
    pos: s.pos,
    hs: s.hs,
    hsVersion: s.hsVersion,
  };
}

export default function StoresAdmin() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState<StoreForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StoreForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    const res = await fetch("/api/admin/sites");
    if (res.ok) {
      setStores((await res.json()).stores);
    } else {
      setLoadError("Couldn't load stores - try refreshing the page.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setNotice("");
    setCreating(true);
    const res = await fetch("/api/admin/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setCreateError(body.error || "Something went wrong.");
      return;
    }
    setNotice(`Added ${form.name.trim()}. Next step: add their Store Manager in Users & Access and pick ${form.name.trim()} as the Site.`);
    setForm(EMPTY_FORM);
    load();
  }

  function startEdit(s: StoreRow) {
    setEditError("");
    setNotice("");
    setEditingId(s.id);
    setEditForm(formFrom(s));
  }

  async function saveEdit(id: string) {
    setEditError("");
    setSaving(true);
    const res = await fetch("/api/admin/sites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...editForm }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setEditError(body.error || "Something went wrong.");
      return;
    }
    setEditingId(null);
    setNotice(`Saved ${editForm.name.trim()}.`);
    load();
  }

  return (
    <div>
      <Card title="Add a store">
        <form onSubmit={handleCreate}>
          <StoreFields value={form} onChange={setForm} />
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" disabled={creating || !form.name.trim()} style={buttonStyle}>
              {creating ? "Adding..." : form.name.trim() ? `Add ${form.name.trim()}` : "Add store"}
            </button>
            {createError && <span style={{ color: "#d03b3b", fontSize: 13 }}>{createError}</span>}
          </div>
        </form>
      </Card>

      {notice && (
        <div style={{ background: "#EAF7EA", color: "#1d6b1d", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginTop: 16 }}>{notice}</div>
      )}

      <div style={{ height: 20 }} />

      <Card title={`Stores (${stores.length})`}>
        {loadError && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 12 }}>{loadError}</div>}
        {loading ? (
          <p style={{ color: "#6E6E6E" }}>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "6px 4px" }}>Store</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>POS check</th>
                  <th>H&amp;S check</th>
                  <th>Store manager</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) =>
                  editingId === s.id ? (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f2f2f2", background: "#FAFAFB" }}>
                      <td colSpan={8} style={{ padding: "14px 8px" }}>
                        <div style={{ fontWeight: 600, marginBottom: 10 }}>Edit {s.name}</div>
                        <StoreFields value={editForm} onChange={setEditForm} showActive />
                        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
                          <button onClick={() => saveEdit(s.id)} disabled={saving || !editForm.name.trim()} style={buttonStyle}>
                            {saving ? "Saving..." : `Save ${editForm.name.trim() || "store"}`}
                          </button>
                          <button onClick={() => setEditingId(null)} style={linkButtonStyle}>Cancel</button>
                          {editError && <span style={{ color: "#d03b3b", fontSize: 13 }}>{editError}</span>}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f2f2f2", opacity: s.active ? 1 : 0.55 }}>
                      <td style={{ padding: "8px 4px", fontWeight: 500 }}>{s.name}</td>
                      <td>{s.siteType || "-"}</td>
                      <td>{s.region || "-"}</td>
                      <td>{s.pos ? <Tick label={s.auditGroup || "Yes"} /> : <Off />}</td>
                      <td>{s.hs ? <Tick label={`${s.hsVersion} version`} /> : <Off />}</td>
                      <td style={{ fontSize: 13 }}>
                        {s.storeManagers.length ? s.storeManagers.join(", ") : <span style={{ color: "#b07a00" }}>No login yet</span>}
                      </td>
                      <td>{s.active ? <span style={{ color: "#0ca30c" }}>Active</span> : <span style={{ color: "#999" }}>Switched off</span>}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button onClick={() => startEdit(s)} style={linkButtonStyle}>Edit</button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StoreFields({ value, onChange, showActive }: { value: StoreForm; onChange: (v: StoreForm) => void; showActive?: boolean }) {
  const set = (patch: Partial<StoreForm>) => onChange({ ...value, ...patch });
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Store name">
          <input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Cookstown Clearance Outlet" style={{ ...inputStyle, width: 260, maxWidth: "100%" }} />
        </Field>
        <Field label="Type">
          <select value={value.siteType} onChange={(e) => set({ siteType: e.target.value })} style={inputStyle}>
            {SITE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <select value={value.region} onChange={(e) => set({ region: e.target.value })} style={inputStyle}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        {showActive && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, paddingBottom: 8 }}>
            <input type="checkbox" checked={value.active} onChange={(e) => set({ active: e.target.checked })} />
            Active
          </label>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
        <div style={panelStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={value.pos} onChange={(e) => set({ pos: e.target.checked })} />
            Does the monthly POS check
          </label>
          {value.pos ? (
            <div style={{ marginTop: 10 }}>
              <Field label="POS audit group">
                <select value={value.auditGroup} onChange={(e) => set({ auditGroup: e.target.value })} style={inputStyle}>
                  {AUDIT_GROUPS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </Field>
              <div style={hintStyle}>Gets the POS Check page and the 25th/28th reminder emails.</div>
            </div>
          ) : (
            <div style={hintStyle}>No POS Check page, no POS reminders.</div>
          )}
        </div>

        <div style={panelStyle}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={value.hs} onChange={(e) => set({ hs: e.target.checked })} />
            Does the monthly H&amp;S check
          </label>
          {value.hs ? (
            <div style={{ marginTop: 10 }}>
              {HS_VERSIONS.map((v) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 6 }}>
                  <input type="radio" name={`hsVersion-${showActive ? "edit" : "new"}`} checked={value.hsVersion === v} onChange={() => set({ hsVersion: v })} />
                  {HS_VERSION_LABELS[v]}
                </label>
              ))}
              <div style={hintStyle}>Counted in H&amp;S Review, Showroom Scores and the overdue email.</div>
            </div>
          ) : (
            <div style={hintStyle}>No H&amp;S Check page, not counted as overdue.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function Tick({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 13 }}>
      <span style={{ color: "#0ca30c", fontWeight: 700, marginRight: 4 }}>&#10003;</span>
      {label}
    </span>
  );
}

function Off() {
  return <span style={{ color: "#999", fontSize: 13 }}>Off</span>;
}

const inputStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 };
const buttonStyle: React.CSSProperties = { background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const linkButtonStyle: React.CSSProperties = { background: "none", border: "none", color: "#3348B0", fontSize: 13, cursor: "pointer", marginRight: 10, padding: 0, textDecoration: "underline" };
const panelStyle: React.CSSProperties = { border: "1px solid #eee", borderRadius: 8, padding: "12px 14px", minWidth: 260, flex: "1 1 260px", background: "#fff" };
const hintStyle: React.CSSProperties = { fontSize: 12, color: "#6E6E6E", marginTop: 6 };
