import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { createPurchaseOrder, receivePurchase, PurchaseError } from "../src/lib/purchasing";
import { toNumber } from "../src/lib/decimal";
import { resetAndSeed } from "./helpers";

describe("Purchasing & receiving", () => {
  let fx: Awaited<ReturnType<typeof resetAndSeed>>;
  before(async () => {
    fx = await resetAndSeed();
  });

  test("receiving adds stock, blends moving-average cost, and writes the ledger", async () => {
    const oatBefore = await prisma.ingredient.findUniqueOrThrow({
      where: { id: fx.ingredients.oat.id },
    });
    const stock0 = toNumber(oatBefore.currentStock); // 400
    const cost0 = toNumber(oatBefore.unitCost); // 0.09

    const recvQty = 5000;
    const recvCost = 0.1;

    const po = await createPurchaseOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      supplierId: fx.supplier.id,
      lines: [{ ingredientId: fx.ingredients.oat.id, quantityOrdered: recvQty, unitCost: recvCost }],
    });
    assert.ok(po.poNumber?.startsWith("PO-"));

    const received = await receivePurchase({
      purchaseId: po.id,
      branchId: fx.branch.id,
      userId: fx.user.id,
    });
    assert.equal(received.status, "received");

    const oatAfter = await prisma.ingredient.findUniqueOrThrow({
      where: { id: fx.ingredients.oat.id },
    });
    // Stock rose by the received quantity.
    assert.equal(toNumber(oatAfter.currentStock), stock0 + recvQty);

    // Moving-average cost.
    const expectedCost =
      Math.round(((stock0 * cost0 + recvQty * recvCost) / (stock0 + recvQty)) * 10000) / 10000;
    assert.ok(Math.abs(toNumber(oatAfter.unitCost) - expectedCost) < 0.0001);

    // Ledger 'purchase' in-movement.
    const mv = await prisma.stockMovement.findFirst({
      where: { referenceType: "purchase", referenceId: po.id },
    });
    assert.ok(mv && mv.direction === "in" && mv.movementType === "purchase");
    assert.equal(toNumber(mv.quantity), recvQty);
  });

  test("re-receiving a completed purchase order is rejected", async () => {
    const po = await createPurchaseOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      supplierId: fx.supplier.id,
      lines: [{ ingredientId: fx.ingredients.beans.id, quantityOrdered: 100, unitCost: 0.13 }],
    });
    await receivePurchase({ purchaseId: po.id, branchId: fx.branch.id, userId: fx.user.id });
    await assert.rejects(
      () => receivePurchase({ purchaseId: po.id, branchId: fx.branch.id, userId: fx.user.id }),
      (err) => err instanceof PurchaseError,
    );
  });
});
