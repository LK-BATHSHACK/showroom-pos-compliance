"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong.");
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Change password</h1>
      <p style={{ color: "#6E6E6E", marginTop: 0, marginBottom: 24 }}>
        If you're signing in for the first time with a temporary password, enter it below as your current password.
      </p>
      <Card>
        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 13, color: "#6E6E6E", marginBottom: 4 }}>Current / temporary password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, marginBottom: 14, boxSizing: "border-box" }}
          />
          <label style={{ display: "block", fontSize: 13, color: "#6E6E6E", marginBottom: 4 }}>New password (min. 8 characters)</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, marginBottom: 14, boxSizing: "border-box" }}
          />
          <label style={{ display: "block", fontSize: 13, color: "#6E6E6E", marginBottom: 4 }}>Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, marginBottom: 14, boxSizing: "border-box" }}
          />
          {error && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{ background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {loading ? "Saving..." : "Save new password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
