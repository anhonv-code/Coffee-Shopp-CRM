import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { sellOrder, InsufficientStockError } from "../src/lib/pos";
import { toNumber } from "../src/lib/decimal";
import { resetAndSeed } from "./helpers";

describe("POS sale (critical path)", () => {
  let fx: Awaited<ReturnType<typeof resetAndSeed>>;
  before(async () => {
    fx = await resetAndSeed();
  });

  test("deducts ingredient stock from the recipe and records the ledger", async () => {
    const milkBefore = toNumber(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: fx.ingredients.milk.id } })).currentStock,
    );

    const { order } = await sellOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      paymentMethod: "cash",
      taxRate: 0.07,
      lines: [{ variantId: fx.variants.latteMedium.id, quantity: 2 }],
    });

    const milkAfter = toNumber(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: fx.ingredients.milk.id } })).currentStock,
    );
    assert.equal(milkBefore - milkAfter, 400, "2 lattes should use 400ml milk");

    // Ledger: one movement per recipe ingredient (beans, milk, cup).
    const movements = await prisma.stockMovement.count({
      where: { referenceType: "order", referenceId: order.id },
    });
    assert.equal(movements, 3);

    // COGS snapshot on the order = recipe cost * qty.
    const expectedCogs = (18 * 0.12 + 200 * 0.045 + 1 * 1.5) * 2;
    assert.ok(Math.abs(toNumber(order.cogs) - expectedCogs) < 0.01);

    // Total = subtotal 140 * 1.07 = 149.80
    assert.equal(toNumber(order.total), 149.8);
  });

  test("rejects an order that would oversell, rolling back the whole sale", async () => {
    // Oat stock is 400ml; each Oat latte needs 200ml → 3 needs 600ml.
    const beansBefore = toNumber(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: fx.ingredients.beans.id } })).currentStock,
    );

    await assert.rejects(
      () =>
        sellOrder({
          branchId: fx.branch.id,
          userId: fx.user.id,
          paymentMethod: "cash",
          lines: [{ variantId: fx.variants.latteOat.id, quantity: 3 }],
        }),
      (err) => err instanceof InsufficientStockError,
    );

    // Nothing was deducted (beans unchanged) — the transaction rolled back.
    const beansAfter = toNumber(
      (await prisma.ingredient.findUniqueOrThrow({ where: { id: fx.ingredients.beans.id } })).currentStock,
    );
    assert.equal(beansBefore, beansAfter);
  });
});
