import { ROLES, type Role } from "./constants";

// Fine-grained permissions derived from a user's coarse role. Extend this map
// as new modules land. `*` means "all permissions".
export type Permission =
  | "dashboard:view"
  | "pos:operate"
  | "orders:view"
  | "orders:manage"
  | "inventory:view"
  | "inventory:manage"
  | "products:view"
  | "products:manage"
  | "recipes:manage"
  | "promotions:manage"
  | "customers:view"
  | "customers:manage"
  | "reports:view"
  | "branches:manage"
  | "users:manage";

const PERMISSIONS: Record<Role, Permission[] | ["*"]> = {
  [ROLES.SUPER_ADMIN]: ["*"],
  [ROLES.BRANCH_MANAGER]: [
    "dashboard:view",
    "pos:operate",
    "orders:view",
    "orders:manage",
    "inventory:view",
    "inventory:manage",
    "products:view",
    "products:manage",
    "recipes:manage",
    "promotions:manage",
    "customers:view",
    "customers:manage",
    "reports:view",
  ],
  [ROLES.BARISTA]: [
    "pos:operate",
    "orders:view",
    "orders:manage",
    "inventory:view",
    "products:view",
  ],
  [ROLES.CASHIER]: ["pos:operate", "orders:view", "products:view"],
};

export function can(role: string, permission: Permission): boolean {
  const perms = PERMISSIONS[role as Role];
  if (!perms) return false;
  if (perms[0] === "*") return true;
  return (perms as Permission[]).includes(permission);
}

export function isSuperAdmin(role: string): boolean {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * Returns the branch filter a user is scoped to. Super admins see everything
 * (no filter); everyone else is locked to their own branch. This is the
 * row-level scoping guard from the design — every branch-scoped query should
 * spread this into its `where`.
 */
export function branchScope(user: { role: string; branchId: string | null }): {
  branchId?: string;
} {
  if (isSuperAdmin(user.role)) return {};
  return { branchId: user.branchId ?? "__none__" };
}
