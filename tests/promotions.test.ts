import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { sellOrder, PromoError } from "../src/lib/pos";
import { resolvePromotion, isRejection } from "../src/lib/promotions";
import { toNumber } from "../src/lib/decimal";
import { resetAndSeed } from "./helpers";

describe("Promotions engine", () => {
  let fx: Awaited<ReturnType<typeof resetAndSeed>>;
  before(async () => {
    fx = await resetAndSeed();
  });

  test("WELCOME50 gives ฿50 off above its minimum", async () => {
    const r = await resolvePromotion(prisma, {
      branchId: fx.branch.id,
      code: "WELCOME50",
      subtotal: 160,
    });
    assert.ok(r && !isRejection(r));
    assert.equal(r.discountAmount, 50);
  });

  test("rejects below the minimum order value", async () => {
    const r = await resolvePromotion(prisma, {
      branchId: fx.branch.id,
      code: "WELCOME50",
      subtotal: 80,
    });
    assert.ok(isRejection(r) && /Minimum/.test(r.error));
  });

  test("rejects an unknown code", async () => {
    const r = await resolvePromotion(prisma, {
      branchId: fx.branch.id,
      code: "NOPE",
      subtotal: 200,
    });
    assert.ok(isRejection(r) && /not found/i.test(r.error));
  });

  test("applies the discount in a sale and records the redemption", async () => {
    // 2x Latte Medium = 140 subtotal (>= 100 min). 140-50 = 90, *1.07 = 96.30
    const { order, appliedPromo } = await sellOrder({
      branchId: fx.branch.id,
      userId: fx.user.id,
      paymentMethod: "cash",
      taxRate: 0.07,
      promoCode: "WELCOME50",
      lines: [{ variantId: fx.variants.latteMedium.id, quantity: 2 }],
    });

    assert.equal(appliedPromo?.code, "WELCOME50");
    assert.equal(toNumber(order.discountAmount), 50);
    assert.equal(toNumber(order.total), 96.3);

    const redemptions = await prisma.promoRedemption.count({
      where: { orderId: order.id },
    });
    assert.equal(redemptions, 1);

    const promo = await prisma.promotion.findUniqueOrThrow({
      where: { id: fx.promo.id },
    });
    assert.equal(promo.timesRedeemed, 1);
  });

  test("an invalid explicit code blocks the sale", async () => {
    await assert.rejects(
      () =>
        sellOrder({
          branchId: fx.branch.id,
          userId: fx.user.id,
          paymentMethod: "cash",
          promoCode: "NOPE",
          lines: [{ variantId: fx.variants.latteMedium.id, quantity: 1 }],
        }),
      (err) => err instanceof PromoError,
    );
  });
});
