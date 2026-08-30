import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchScope, can } from "@/lib/rbac";
import { resolveBranch } from "@/lib/branch";
import { toNumber } from "@/lib/decimal";
import { PageHeader, EmptyState } from "@/components/ui";
import { PurchasingClient } from "./purchasing-client";

export default async function PurchasesPage() {
  const user = await requireUser();
  if (!can(user.role, "inventory:manage")) redirect("/inventory");

  const branch = await resolveBranch(user);
  if (!branch) {
    return (
      <>
        <PageHeader title="Purchasing" />
        <EmptyState>No branch assigned to your account.</EmptyState>
      </>
    );
  }

  const scope = branchScope(user);
  const [purchases, suppliers, ingredients] = await Promise.all([
    prisma.stockPurchase.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        supplier: { select: { name: true } },
        items: {
          include: { ingredient: { select: { name: true, unit: true } } },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { OR: [{ branchId: branch.id }, { branchId: null }], isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.ingredient.findMany({
      where: { branchId: branch.id, isActive: true },
      select: { id: true, name: true, unit: true, unitCost: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize Decimals for the client component.
  const poData = purchases.map((p) => ({
    id: p.id,
    poNumber: p.poNumber ?? "(no number)",
    supplier: p.supplier.name,
    status: p.status,
    totalCost: toNumber(p.totalCost),
    orderDate: p.orderDate.toISOString(),
    items: p.items.map((it) => ({
      id: it.id,
      name: it.ingredient.name,
      unit: it.ingredient.unit,
      ordered: toNumber(it.quantityOrdered),
      received: toNumber(it.quantityReceived),
      unitCost: toNumber(it.unitCost),
    })),
  }));
  const ingData = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    unitCost: toNumber(i.unitCost),
  }));

  return (
    <>
      <PageHeader
        title="Purchasing"
        subtitle={`Purchase orders & stock receiving · ${branch.name}`}
      />
      <PurchasingClient
        branchId={branch.id}
        purchases={poData}
        suppliers={suppliers}
        ingredients={ingData}
      />
    </>
  );
}
