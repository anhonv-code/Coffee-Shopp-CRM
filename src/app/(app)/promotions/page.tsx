import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/rbac";
import { toNumber } from "@/lib/decimal";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

const PROMO_TYPE_LABELS: Record<string, string> = {
  percentage_off: "% off",
  fixed_off: "฿ off",
  bogo: "BOGO",
  buy_x_get_y: "Buy X get Y",
  free_item: "Free item",
  loyalty_reward: "Loyalty reward",
};

function promoValue(type: string, value: number): string {
  if (type === "percentage_off") return `${value}%`;
  if (type === "fixed_off") return formatMoney(value);
  return String(value);
}

export default async function PromotionsPage() {
  const user = await requireUser();
  const scope = branchScope(user);
  // Branch-scoped users see their branch promos + global ones.
  const where = scope.branchId
    ? { OR: [{ branchId: scope.branchId }, { branchId: null }] }
    : {};

  const promos = await prisma.promotion.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { endDate: "asc" }],
    include: { _count: { select: { redemptions: true } } },
  });

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Discount rules applied at the POS — codes, windows, and redemptions"
      />

      {promos.length === 0 ? (
        <EmptyState>No promotions yet.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-coffee-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3 text-right font-medium">Min order</th>
                <th className="px-4 py-3 font-medium">Window</th>
                <th className="px-4 py-3 text-right font-medium">Redeemed</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => {
                const live =
                  p.isActive && p.startDate <= now && p.endDate >= now;
                const expired = p.endDate < now;
                return (
                  <tr key={p.id} className="border-t border-coffee-100">
                    <td className="px-4 py-3 font-medium text-coffee-800">
                      {p.name}
                      {p.branchId === null && (
                        <span className="ml-2 text-xs text-coffee-400">
                          global
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.code ? (
                        <code className="rounded bg-coffee-50 px-1.5 py-0.5 text-xs text-coffee-700">
                          {p.code}
                        </code>
                      ) : (
                        <span className="text-xs text-coffee-400">auto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-coffee-600">
                      {PROMO_TYPE_LABELS[p.promoType] ?? p.promoType}
                    </td>
                    <td className="px-4 py-3 text-right text-coffee-800">
                      {promoValue(p.promoType, toNumber(p.discountValue))}
                    </td>
                    <td className="px-4 py-3 text-right text-coffee-500">
                      {toNumber(p.minOrderValue) > 0
                        ? formatMoney(toNumber(p.minOrderValue))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-coffee-500">
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      {p.timeStart && p.timeEnd && (
                        <div>
                          {p.timeStart}–{p.timeEnd}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-coffee-600">
                      {p._count.redemptions}
                      {p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {live ? (
                        <Badge color="green">Live</Badge>
                      ) : expired ? (
                        <Badge color="gray">Expired</Badge>
                      ) : !p.isActive ? (
                        <Badge color="gray">Inactive</Badge>
                      ) : (
                        <Badge color="amber">Scheduled</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
