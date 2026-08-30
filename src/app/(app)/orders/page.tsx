import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/rbac";
import { toNumber } from "@/lib/decimal";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, type OrderStatus } from "@/lib/constants";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

const STATUS_COLOR: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  completed: "green",
  ready: "blue",
  preparing: "amber",
  confirmed: "amber",
  pending: "gray",
  cancelled: "red",
  refunded: "red",
  partially_refunded: "amber",
};

export default async function OrdersPage() {
  const user = await requireUser();
  const scope = branchScope(user);

  const orders = await prisma.order.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      items: { select: { quantity: true } },
      payments: { select: { paymentMethod: true } },
      customer: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="The 50 most recent orders across the POS and online channels"
      />

      {orders.length === 0 ? (
        <EmptyState>No orders yet. Ring one up in the POS.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-coffee-400">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 text-center font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const itemCount = o.items.reduce((s, i) => s + i.quantity, 0);
                const method = o.payments[0]?.paymentMethod;
                return (
                  <tr
                    key={o.id}
                    className="border-t border-coffee-100 hover:bg-coffee-50"
                  >
                    <td className="px-4 py-3 font-medium text-coffee-800">
                      {o.orderNumber}
                    </td>
                    <td className="px-4 py-3 text-coffee-500">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-coffee-600">
                      {o.customer?.name ?? "Walk-in"}
                    </td>
                    <td className="px-4 py-3 capitalize text-coffee-500">
                      {o.source}
                    </td>
                    <td className="px-4 py-3 text-center text-coffee-600">
                      {itemCount}
                    </td>
                    <td className="px-4 py-3 text-coffee-500">
                      {method ? (PAYMENT_METHOD_LABELS[method] ?? method) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-coffee-800">
                      {formatMoney(toNumber(o.total))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge color={STATUS_COLOR[o.status] ?? "gray"}>
                        {(o.status as OrderStatus).replace("_", " ")}
                      </Badge>
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
