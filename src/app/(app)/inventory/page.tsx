import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchScope, can } from "@/lib/rbac";
import { toNumber } from "@/lib/decimal";
import { formatMoney, formatNumber, formatDateTime } from "@/lib/format";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";

export default async function InventoryPage() {
  const user = await requireUser();
  const scope = branchScope(user);
  const canManage = can(user.role, "inventory:manage");

  const [ingredients, movements] = await Promise.all([
    prisma.ingredient.findMany({
      where: { ...scope, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { ingredient: { select: { name: true, unit: true } } },
    }),
  ]);

  const totalValue = ingredients.reduce((s, i) => s + toNumber(i.stockValue), 0);
  const lowCount = ingredients.filter(
    (i) => toNumber(i.currentStock) <= toNumber(i.reorderLevel),
  ).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Ingredient stock levels and the movement ledger"
        actions={
          canManage ? (
            <Link href="/inventory/purchases" className="btn-primary">
              Purchase orders
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Ingredients" value={formatNumber(ingredients.length)} />
        <StatCard
          label="Stock value"
          value={formatMoney(totalValue)}
          accent="coffee"
        />
        <StatCard
          label="Low stock"
          value={formatNumber(lowCount)}
          accent={lowCount > 0 ? "red" : "green"}
        />
        <StatCard
          label="Recent movements"
          value={formatNumber(movements.length)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stock table */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-coffee-800">Stock on hand</h2>
          {ingredients.length === 0 ? (
            <EmptyState>No ingredients yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-coffee-400">
                    <th className="pb-2 font-medium">Ingredient</th>
                    <th className="pb-2 text-right font-medium">On hand</th>
                    <th className="pb-2 text-right font-medium">Reorder</th>
                    <th className="pb-2 text-right font-medium">Unit cost</th>
                    <th className="pb-2 text-right font-medium">Value</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map((i) => {
                    const current = toNumber(i.currentStock);
                    const reorder = toNumber(i.reorderLevel);
                    const low = current <= reorder;
                    return (
                      <tr key={i.id} className="border-t border-coffee-100">
                        <td className="py-2 text-coffee-800">{i.name}</td>
                        <td className="py-2 text-right text-coffee-700">
                          {formatNumber(current, 2)} {i.unit}
                        </td>
                        <td className="py-2 text-right text-coffee-500">
                          {formatNumber(reorder, 2)}
                        </td>
                        <td className="py-2 text-right text-coffee-500">
                          {formatMoney(toNumber(i.unitCost))}
                        </td>
                        <td className="py-2 text-right text-coffee-700">
                          {formatMoney(toNumber(i.stockValue))}
                        </td>
                        <td className="py-2 text-right">
                          {low ? (
                            <Badge color="red">Reorder</Badge>
                          ) : (
                            <Badge color="green">OK</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Ledger */}
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-coffee-800">Movement ledger</h2>
          {movements.length === 0 ? (
            <EmptyState>No movements recorded.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {movements.map((m) => (
                <li key={m.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-coffee-800">{m.ingredient.name}</span>
                    <span
                      className={
                        m.direction === "out"
                          ? "text-red-600"
                          : "text-emerald-600"
                      }
                    >
                      {m.direction === "out" ? "−" : "+"}
                      {formatNumber(toNumber(m.quantity), 2)} {m.ingredient.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-coffee-400">
                    <span className="capitalize">{m.movementType}</span>
                    <span>{formatDateTime(m.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
