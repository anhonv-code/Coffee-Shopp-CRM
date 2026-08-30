import "server-only";
import { prisma } from "./prisma";
import { isSuperAdmin } from "./rbac";
import type { SessionUser } from "./auth";

/**
 * Resolve the branch a user is acting in. Branch-scoped users use their own
 * branch; a super admin falls back to the first active branch (a full branch
 * switcher can be layered on later).
 */
export async function resolveBranch(user: SessionUser) {
  if (user.branchId) {
    return prisma.branch.findUnique({ where: { id: user.branchId } });
  }
  if (isSuperAdmin(user.role)) {
    return prisma.branch.findFirst({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });
  }
  return null;
}
