import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { sellOrder } from "../src/lib/pos";
import { advanceOrderStatus, StatusError } from "../src/lib/fulfillment";
import { toNumber } from "../src/lib/decimal";
import { resetAndSeed } from "./helpers";

describe("Order fulfillment (kitchen flow)", () => {
  let fx: Awaited<ReturnType<typeof resetAndSeed>>;
  before(async () => {
    fx = await resetAndSeed();
  });

  test("an online order starts pending, unpaid, but reserves stock", async () => {
    const milkBefore = toNumber(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: fx.ingredients.milk.id } })).currentStock,
    );

    const { order } = await sellOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      source: "online",
      status: "pending",
      markPaid: false,
      taxRate: 0.07,
      lines: [{ variantId: fx.variants.latteMedium.id, quantity: 1 }],
    });

    assert.equal(order.status, "pending");
    assert.equal(toNumber(order.amountPaid), 0);
    const payments = await prisma.payment.count({ where: { orderId: order.id } });
    assert.equal(payments, 0, "unpaid order has no payment row yet");

    // Stock was still reserved at order time.
    const milkAfter = toNumber(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: fx.ingredients.milk.id } })).currentStock,
    );
    assert.equal(milkBefore - milkAfter, 200);
  });

  test("advances through the state machine and settles payment on completion", async () => {
    const { order } = await sellOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      source: "online",
      status: "pending",
      markPaid: false,
      taxRate: 0.07,
      lines: [{ variantId: fx.variants.latteMedium.id, quantity: 1 }],
    });

    for (const next of ["confirmed", "preparing", "ready", "completed"]) {
      const updated = await advanceOrderStatus({
        orderId: order.id,
        branchId: fx.branch.id,
        userId: fx.user.id,
        newStatus: next,
      });
      assert.equal(updated.status, next);
    }

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    assert.ok(final.completedAt, "completedAt is set");
    assert.equal(toNumber(final.amountPaid), toNumber(final.total), "paid in full on completion");
    const payments = await prisma.payment.count({ where: { orderId: order.id } });
    assert.equal(payments, 1, "payment recorded on completion");
  });

  test("rejects an illegal transition", async () => {
    const { order } = await sellOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      source: "online",
      status: "pending",
      markPaid: false,
      lines: [{ variantId: fx.variants.latteMedium.id, quantity: 1 }],
    });
    await assert.rejects(
      () =>
        advanceOrderStatus({
          orderId: order.id,
          branchId: fx.branch.id,
          userId: fx.user.id,
          newStatus: "ready", // pending -> ready is not allowed
        }),
      (err) => err instanceof StatusError,
    );
  });
});
