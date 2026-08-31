import { redirect } from "next/navigation";
import { requireRole } from "./auth";
import type { UserRole, SessionPayload } from "./auth-edge";

/** Server-Component/layout helper: redirects if the signed-in user's role isn't in `roles`. `fallback` is where non-permitted-but-logged-in users land (default: their natural home page by role). */
export async function guardRole(roles: UserRole[], fallback?: string): Promise<SessionPayload> {
  const session = await requireRole(roles);
  if (session) return session;

  // Not logged in at all shouldn't happen here (middleware already gates
  // every non-login route), but fall back to /login defensively.
  const { getSession } = await import("./auth");
  const current = await getSession();
  if (!current) redirect("/login");

  redirect(fallback || homeForRole(current.role));
}

export function homeForRole(role: UserRole): string {
  switch (role) {
    case "Store Manager":
      return "/hs-walkaround";
    case "H&S":
      return "/hs-review";
    default:
      return "/dashboard";
  }
}
