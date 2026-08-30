import { prisma } from "./prisma";
import { toNumber } from "./decimal";

export class StatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatusError";
  }
}

// Allowed forward transitions for the order state machine.
export const NEXT_STATUS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed"],
};

/** Statuses that still need attention on the kitchen board. */
export const ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

export async function advanceOrderStatus(opts: {
  orderId: string;
  branchId: string;
  userId: string;
  newStatus: string;
  paymentMethod?: string;
  cancelReason?: string;
}) {
  const { orderId, branchId, userId, newStatus, paymentMethod = "cash", cancelReason } = opts;

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.branchId !== branchId)
      throw new StatusError("Order not found for this branch.");

    const allowed = NEXT_STATUS[order.status] ?? [];
    if (!allowed.includes(newStatus))
      throw new StatusError(`Cannot move an order from "${order.status}" to "${newStatus}".`);

    const now = new Date();
    const data: Record<string, unknown> = {
      status: newStatus,
      statusHistory: {
        create: { oldStatus: order.status, newStatus, changedById: userId },
      },
    };

    if (newStatus === "confirmed") data.confirmedAt = order.confirmedAt ?? now;
    if (newStatus === "ready") data.preparedAt = now;
    if (newStatus === "cancelled") {
      data.cancelledAt = now;
      if (cancelReason) data.cancelReason = cancelReason;
    }

    if (newStatus === "completed") {
      data.completedAt = now;
      // Settle payment on pickup for orders that weren't paid up front (online).
      const outstanding = toNumber(order.total) - toNumber(order.amountPaid);
      if (outstanding > 0) {
        data.amountPaid = toNumber(order.total);
        data.payments = {
          create: { paymentMethod, amount: outstanding, status: "completed" },
        };
        // Credit loyalty now that the order is paid.
        if (order.customerId) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              totalSpent: { increment: outstanding },
              visitCount: { increment: 1 },
              loyaltyPoints: { increment: Math.floor(toNumber(order.total) / 10) },
            },
          });
        }
      }
    }

    return tx.order.update({ where: { id: order.id }, data });
  });
}
