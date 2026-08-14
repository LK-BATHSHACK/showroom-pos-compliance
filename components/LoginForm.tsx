"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("next") || "/dashboard");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 40, borderRadius: 12, width: 340, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bathshack-logo.png" alt="Bathshack" style={{ height: 32, marginBottom: 16, display: "block" }} />
      <h1 style={{ fontSize: 20, marginTop: 0, marginBottom: 20 }}>Showroom POS Compliance</h1>
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", border: "1px solid #ccc", borderRadius: 6, fontSize: 15, marginBottom: 12 }}
        autoFocus
      />
      {error && <div style={{ color: "#d03b3b", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button
        type="submit"
        disabled={loading}
        style={{ width: "100%", padding: "10px 12px", background: "#E6017E", color: "#fff", border: "none", borderRadius: 6, fontSize: 15, fontWeight: "bold", cursor: "pointer" }}
      >
        {loading ? "Checking..." : "Log in"}
      </button>
    </form>
  );
}
