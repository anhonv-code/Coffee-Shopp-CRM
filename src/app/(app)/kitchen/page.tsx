import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchScope, can } from "@/lib/rbac";
import { resolveBranch } from "@/lib/branch";
import { ACTIVE_STATUSES } from "@/lib/fulfillment";
import { toNumber } from "@/lib/decimal";
import { PageHeader, EmptyState } from "@/components/ui";
import { KitchenClient } from "./kitchen-client";

export default async function KitchenPage() {
  const user = await requireUser();
  if (!can(user.role, "orders:manage")) redirect("/dashboard");

  const branch = await resolveBranch(user);
  if (!branch) {
    return (
      <>
        <PageHeader title="Kitchen" />
        <EmptyState>No branch assigned to your account.</EmptyState>
      </>
    );
  }

  const scope = branchScope(user);
  const orders = await prisma.order.findMany({
    where: { ...scope, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: {
      items: { select: { id: true, productName: true, variantName: true, quantity: true, notes: true } },
      customer: { select: { name: true } },
    },
  });

  const data = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    source: o.source,
    orderType: o.orderType,
    total: toNumber(o.total),
    createdAt: o.createdAt.toISOString(),
    customer: o.customer?.name ?? null,
    customerNotes: o.customerNotes,
    items: o.items.map((it) => ({
      id: it.id,
      name: `${it.productName} · ${it.variantName}`,
      quantity: it.quantity,
      notes: it.notes,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Kitchen display"
        subtitle={`Active orders · ${branch.name} · auto-refreshes`}
      />
      <KitchenClient branchId={branch.id} orders={data} />
    </>
  );
}
