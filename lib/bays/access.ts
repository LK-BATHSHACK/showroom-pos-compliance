// Who can do what in the bay register (Round 28). One place, imported by every
// page and API route, so the rules can't drift apart.
//
// - Layout Lead (Ryan): every store; raises changes, approves store-raised
//   changes, clears exceptions. Business owner of the process.
// - Admin: everything.
// - Store Manager: own store only; checks bays, installs changes, raises changes
//   (which wait for the Layout Lead's approval).
// - Store Staff: one shared read-only login per store; view and print only
//   (spec open decision - default until Lorraine says otherwise).
// - Marketing: read-only, every store (product locator for shoots).

import type { SessionPayload, UserRole } from "@/lib/auth-edge";

export const BAY_VIEW_ROLES: UserRole[] = ["Admin", "Marketing", "Layout Lead", "Store Manager", "Store Staff"];
export const BAY_CHANGE_ROLES: UserRole[] = ["Admin", "Layout Lead", "Store Manager"];
export const BAY_CHECK_ROLES: UserRole[] = ["Admin", "Layout Lead", "Store Manager"];
export const BAY_DESK_ROLES: UserRole[] = ["Admin", "Layout Lead"];

/** Roles locked to one store (session.siteId). */
export function isStoreLocked(role: UserRole): boolean {
  return role === "Store Manager" || role === "Store Staff";
}

export function canSeeStore(s: SessionPayload, storeId: string): boolean {
  if (!BAY_VIEW_ROLES.includes(s.role)) return false;
  return isStoreLocked(s.role) ? s.siteId === storeId : true;
}

export function canChangeStore(s: SessionPayload, storeId: string): boolean {
  return BAY_CHANGE_ROLES.includes(s.role) && canSeeStore(s, storeId);
}

export function canCheckStore(s: SessionPayload, storeId: string): boolean {
  return BAY_CHECK_ROLES.includes(s.role) && canSeeStore(s, storeId);
}

export function isDeskRole(s: SessionPayload): boolean {
  return BAY_DESK_ROLES.includes(s.role);
}
