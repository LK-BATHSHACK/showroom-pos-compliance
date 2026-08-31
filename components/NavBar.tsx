"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload, UserRole } from "@/lib/auth-edge";

type NavLink = { href: string; label: string; roles: UserRole[] };

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Overview", roles: ["Admin", "Marketing"] },
  { href: "/actions", label: "Actions", roles: ["Admin", "Marketing"] },
  { href: "/upload", label: "Submit Audit", roles: ["Admin", "Marketing"] },
  { href: "/requests", label: "POS Requests", roles: ["Admin", "Marketing"] },
  { href: "/hs-walkaround", label: "H&S Walkaround", roles: ["Admin", "Marketing", "H&S", "Store Manager"] },
  { href: "/hs-review", label: "H&S Review", roles: ["Admin", "Marketing", "H&S"] },
  { href: "/admin/users", label: "Users & Access", roles: ["Admin"] },
];

export default function NavBar({ session }: { session: SessionPayload | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!session) return null; // login page renders without the nav

  const links = LINKS.filter((l) => l.roles.includes(session.role));

  return (
    <nav style={{ background: "#1D1C1D", padding: "0 24px", display: "flex", alignItems: "center", height: 56 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bathshack-logo-white.png" alt="Bathshack" style={{ height: 22, marginRight: 32, display: "block" }} />
      <div style={{ display: "flex", gap: 24, flex: 1 }}>
        {links.map((l) => (
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
              whiteSpace: "nowrap",
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontSize: 13, lineHeight: 1.2 }}>{session.name}</div>
          <div style={{ color: "#8A8A8A", fontSize: 11, lineHeight: 1.2 }}>
            {session.role}{session.siteName ? ` · ${session.siteName}` : ""}
          </div>
        </div>
        <button
          onClick={logout}
          style={{ background: "none", border: "1px solid #444", color: "#B3B3B3", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
