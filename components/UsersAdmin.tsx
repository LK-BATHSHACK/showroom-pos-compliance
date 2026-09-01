"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  siteId: string | null;
  siteName: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

type SiteOption = { id: string; name: string };

const ROLES = ["Admin", "Marketing", "H&S", "Store Manager"];

export default function UsersAdmin() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "Store Manager", siteId: "" });
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState("");
  const [rowError, setRowError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const body = await res.json();
      setUsers(body.users);
      setSites(body.sites);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (form.role === "Store Manager" && !form.siteId) {
      setError("Pick a Site for a Store Manager account.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(body.error || "Something went wrong.");
      return;
    }
    setNotice(`Created ${form.name}. Temporary password (share this with them directly, it won't be shown again): ${body.tempPassword}`);
    setForm({ name: "", email: "", role: "Store Manager", siteId: "" });
    load();
  }

  async function toggleActive(u: UserRow) {
    setRowError("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active: !u.active }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRowError(body.error || "Something went wrong.");
      return;
    }
    load();
  }

  async function deleteUser(u: UserRow) {
    if (!window.confirm(`Permanently delete ${u.name}'s account (${u.email})? This can't be undone - use Disable instead if you might want it back.`)) {
      return;
    }
    setRowError("");
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setRowError(body.error || "Something went wrong.");
      return;
    }
    load();
  }

  async function resetPassword(u: UserRow) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, resetPassword: true }),
    });
    const body = await res.json();
    if (res.ok && body.tempPassword) {
      setNotice(`New temporary password for ${u.name} (share this with them directly, it won't be shown again): ${body.tempPassword}`);
    }
    load();
  }

  return (
    <div>
      <Card title="Add a user">
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={inputStyle}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {form.role === "Store Manager" && (
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6E6E6E", marginBottom: 4 }}>Site</label>
              <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} style={inputStyle}>
                <option value="">Select a site...</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" disabled={creating || !form.name || !form.email} style={buttonStyle}>
            {creating ? "Creating..." : "Create account"}
          </button>
        </form>
        {error && <div style={{ color: "#d03b3b", fontSize: 13, marginTop: 10 }}>{error}</div>}
        {notice && (
          <div style={{ background: "#FFF6EB", color: "#8a5a00", padding: "10px 14px", borderRadius: 6, fontSize: 13, marginTop: 12 }}>
            {notice}
          </div>
        )}
      </Card>

      <div style={{ height: 20 }} />

      <Card title={`Users (${users.length})`}>
        {rowError && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 12 }}>{rowError}</div>}
        {loading ? (
          <p style={{ color: "#6E6E6E" }}>Loading...</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6E6E6E", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: "6px 4px" }}>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Site</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "8px 4px" }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.siteName || "-"}</td>
                  <td>
                    {u.active ? <span style={{ color: "#0ca30c" }}>Active</span> : <span style={{ color: "#999" }}>Disabled</span>}
                    {u.mustChangePassword && <span style={{ color: "#e8622c", marginLeft: 8, fontSize: 12 }}>Pending first login</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button onClick={() => toggleActive(u)} style={linkButtonStyle}>{u.active ? "Disable" : "Enable"}</button>
                    <button onClick={() => resetPassword(u)} style={linkButtonStyle}>Reset password</button>
                    <button onClick={() => deleteUser(u)} style={{ ...linkButtonStyle, color: "#d03b3b" }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 };
const buttonStyle: React.CSSProperties = { background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const linkButtonStyle: React.CSSProperties = { background: "none", border: "none", color: "#3348B0", fontSize: 13, cursor: "pointer", marginRight: 10, padding: 0, textDecoration: "underline" };
