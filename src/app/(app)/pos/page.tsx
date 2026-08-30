import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMenu } from "@/lib/catalog";
import { resolveBranch } from "@/lib/branch";
import { PageHeader, EmptyState } from "@/components/ui";
import { PosClient } from "./pos-client";

export default async function PosPage() {
  const user = await requireUser();
  const branch = await resolveBranch(user);

  if (!branch) {
    return (
      <>
        <PageHeader title="Point of Sale" />
        <EmptyState>
          No branch is assigned to your account. Ask an administrator to assign
          you to a branch.
        </EmptyState>
      </>
    );
  }

  const [menu, customers] = await Promise.all([
    getMenu(branch.id),
    prisma.customer.findMany({
      where: { branchId: branch.id, isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Point of Sale"
        subtitle={`${branch.name} · ${branch.code}`}
      />
      <PosClient branchId={branch.id} menu={menu} customers={customers} />
    </>
  );
}
