import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { isSuperAdmin } from "@/lib/rbac";
import { Nav } from "./nav";
import { logout } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const branch = user.branchId
    ? await prisma.branch.findUnique({ where: { id: user.branchId } })
    : null;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-coffee-800 p-4 text-white">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-2xl">☕</span>
          <div>
            <div className="text-sm font-bold leading-tight">Coffee Shopp</div>
            <div className="text-xs text-coffee-300">CRM &amp; POS</div>
          </div>
        </div>

        <Nav />

        <div className="mt-auto border-t border-coffee-700 pt-4">
          <div className="px-2 text-sm font-medium">{user.name}</div>
          <div className="px-2 text-xs text-coffee-300">
            {ROLE_LABELS[user.role as Role] ?? user.role}
          </div>
          <div className="mb-3 px-2 text-xs text-coffee-400">
            {isSuperAdmin(user.role)
              ? "All branches"
              : (branch?.name ?? "No branch")}
          </div>
          <form action={logout}>
            <button className="btn w-full bg-coffee-700 text-coffee-100 hover:bg-coffee-600">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden p-6">{children}</main>
    </div>
  );
}
