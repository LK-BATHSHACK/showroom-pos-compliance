"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload, UserRole } from "@/lib/auth-edge";

type NavLink = { href: string; label: string; roles: UserRole[] };

const LINKS: NavLink[] = [
  { href: "/dashboard", label: "Overview", roles: ["Admin", "Marketing"] },
  // H&S added 9 Sep 2026 (Lorraine: "all the H&S logins need to be able to
  // see the mark resolved and manage the h&s side") - the PATCH API
  // already permitted H&S to resolve actions (lib/auth via
  // app/api/action/[id]/route.ts), the nav link (and the page guard below)
  // just hadn't caught up to let them reach it.
  { href: "/actions", label: "Actions", roles: ["Admin", "Marketing", "H&S"] },
  { href: "/pos-check", label: "POS Check", roles: ["Admin", "Marketing", "Store Manager"] },
  { href: "/requests", label: "POS Requests", roles: ["Admin", "Marketing"] },
  { href: "/hs-check", label: "H&S Check", roles: ["Admin", "Marketing", "H&S", "Store Manager"] },
  { href: "/hs-review", label: "H&S Review", roles: ["Admin", "Marketing", "H&S"] },
  // Consumables added 10 Sep 2026 - Store Manager submits requests; Admin/
  // Marketing/Operations (Chris Agnew) see the cross-store dashboard.
  { href: "/consumables", label: "Consumables", roles: ["Admin", "Marketing", "Operations", "Store Manager"] },
  { href: "/admin/questions", label: "Questions", roles: ["Admin", "H&S"] },
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
    <nav style={{ background: "#1D1C1D", padding: "0 16px", display: "flex", alignItems: "center", height: 56, overflowX: "auto" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bathshack-logo-white.png" alt="Bathshack" style={{ height: 22, marginRight: 20, display: "block", flexShrink: 0 }} />
      {/* Was a plain flex row with no wrap/scroll - on a narrow phone (7
          links + logo + name + logout, all whiteSpace:nowrap) that forced
          the whole page wider than the screen. overflowX:auto here keeps
          the nav scrollable on its own without pushing the page itself into
          horizontal scroll (2 Sep 2026 mobile pass). */}
      <div style={{ display: "flex", gap: 20, flex: 1, overflowX: "auto" }}>
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
              flexShrink: 0,
            }}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, paddingLeft: 12 }}>
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
