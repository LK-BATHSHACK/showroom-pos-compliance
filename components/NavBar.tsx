"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/actions", label: "Actions" },
  { href: "/upload", label: "Submit Audit" },
  { href: "/requests", label: "POS Requests" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav style={{ background: "#1D1C1D", padding: "0 24px", display: "flex", alignItems: "center", height: 56 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bathshack-logo-white.png" alt="Bathshack" style={{ height: 22, marginRight: 32, display: "block" }} />
      <div style={{ display: "flex", gap: 24, flex: 1 }}>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              color: pathname?.startsWith(l.href) ? "#fff" : "#B3B3B3",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: pathname?.startsWith(l.href) ? 600 : 400,
              borderBottom: pathname?.startsWith(l.href) ? "2px solid #E6017E" : "2px solid transparent",
              paddingBottom: 4,
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <button
        onClick={logout}
        style={{ background: "none", border: "1px solid #444", color: "#B3B3B3", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
      >
        Log out
      </button>
    </nav>
  );
}
