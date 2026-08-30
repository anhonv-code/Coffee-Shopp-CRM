import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber, round } from "./decimal";
import { resolvePromotion, isRejection } from "./promotions";

export class InsufficientStockError extends Error {
  constructor(
    public ingredientName: string,
    public available: number,
    public required: number,
    public unit: string,
  ) {
    super(
      `Insufficient stock for ${ingredientName}: ${available}${unit} available, ${required}${unit} required`,
    );
    this.name = "InsufficientStockError";
  }
}

export class PromoError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "PromoError";
  }
}

export interface CartLine {
  variantId: string;
  quantity: number;
  notes?: string;
}

export interface SellInput {
  branchId: string;
  userId: string;
  posSessionId?: string | null;
  customerId?: string | null;
  source?: string;
  orderType?: string;
  lines: CartLine[];
  paymentMethod: string;
  discountAmount?: number;
  promoCode?: string | null;
  taxRate?: number; // e.g. 0.07 for 7% VAT
  customerNotes?: string;
}

/** Generate a per-branch, per-day order number: ORD-YYYYMMDD-0042 */
async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<string> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const countToday = await tx.order.count({
    where: { branchId, createdAt: { gte: startOfDay } },
  });
  const seq = String(countToday + 1).padStart(4, "0");
  return `ORD-${y}${m}${d}-${seq}`;
}

/**
 * The critical path: sell an order at the POS.
 *
 * In a single transaction it:
 *   1. Prices each line from its variant, computes COGS from the recipe (BOM).
 *   2. Atomically deducts every ingredient's stock (guarded so it never goes
 *      negative) — rolling back the whole sale if any ingredient is short.
 *   3. Writes the stock ledger rows (one per ingredient consumed).
 *   4. Creates the order, order items, and payment.
 *
 * This is the one place recipes-as-BOM pays off: the same recipe drives stock
 * deduction and the COGS that powers the P&L dashboard.
 */
export async function sellOrder(input: SellInput) {
  const {
    branchId,
    userId,
    posSessionId = null,
    customerId = null,
    source = "pos",
    orderType = "dine_in",
    lines,
    paymentMethod,
    discountAmount = 0,
    promoCode = null,
    taxRate = 0,
    customerNotes,
  } = input;

  if (!lines.length) throw new Error("Cannot create an empty order");

  return prisma.$transaction(async (tx) => {
    // --- 1. Load variants + recipes for every line -------------------------
    const variantIds = [...new Set(lines.map((l) => l.variantId))];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: {
        product: true,
        recipe: {
          where: { isActive: true },
          include: { items: { include: { ingredient: true } } },
        },
      },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // Aggregate the total quantity needed per ingredient across all lines.
    const ingredientNeed = new Map<
      string,
      { name: string; unit: string; unitCost: number; qty: number }
    >();

    let subtotal = 0;
    let totalCogs = 0;
    const orderItemsData: Prisma.OrderItemCreateManyOrderInput[] = [];

    for (const line of lines) {
      const variant = variantMap.get(line.variantId);
      if (!variant) throw new Error(`Unknown variant: ${line.variantId}`);

      const unitPrice = toNumber(variant.price);
      const lineTotal = round(unitPrice * line.quantity);
      subtotal += lineTotal;

      // COGS from the recipe (0 if the variant has no recipe yet).
      let unitCogs = 0;
      if (variant.recipe) {
        for (const item of variant.recipe.items) {
          const qty = toNumber(item.quantity);
          const cost = toNumber(item.ingredient.unitCost);
          unitCogs += qty * cost;

          const needQty = qty * line.quantity;
          const existing = ingredientNeed.get(item.ingredientId);
          if (existing) {
            existing.qty += needQty;
          } else {
            ingredientNeed.set(item.ingredientId, {
              name: item.ingredient.name,
              unit: item.ingredient.unit,
              unitCost: cost,
              qty: needQty,
            });
          }
        }
      }
      const lineCogs = round(unitCogs * line.quantity, 4);
      totalCogs += lineCogs;

      orderItemsData.push({
        variantId: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        quantity: line.quantity,
        unitPrice,
        lineTotal,
        cogs: lineCogs,
        notes: line.notes,
      });
    }

    // --- 2. Atomically deduct each ingredient ------------------------------
    for (const [ingredientId, need] of ingredientNeed) {
      // Guarded update: only succeeds if there is enough stock. Postgres and
      // SQLite both lock the row for the duration of the UPDATE, so two
      // concurrent sales can never oversell.
      const affected = await tx.$executeRaw`
        UPDATE "Ingredient"
        SET "currentStock" = "currentStock" - ${need.qty},
            "stockValue"   = ("currentStock" - ${need.qty}) * "unitCost",
            "updatedAt"    = ${new Date()}
        WHERE "id" = ${ingredientId}
          AND "currentStock" >= ${need.qty}
      `;
      if (affected === 0) {
        const current = await tx.ingredient.findUnique({
          where: { id: ingredientId },
          select: { currentStock: true },
        });
        throw new InsufficientStockError(
          need.name,
          toNumber(current?.currentStock),
          need.qty,
          need.unit,
        );
      }
    }

    // --- 3. Promotions + financials ----------------------------------------
    // Resolve a promo (explicit code or best auto-promo) against the subtotal.
    // An invalid explicit code blocks the sale so the cashier is told why.
    const promo = await resolvePromotion(tx, {
      branchId,
      code: promoCode,
      subtotal,
    });
    if (isRejection(promo)) throw new PromoError(promo.error);
    const promoDiscount = promo?.discountAmount ?? 0;

    const discount = round(Math.min(discountAmount + promoDiscount, subtotal));
    const taxable = subtotal - discount;
    const taxAmount = round(taxable * taxRate);
    const total = round(taxable + taxAmount);

    // --- 4. Create the order, items, ledger rows, and payment --------------
    const orderNumber = await nextOrderNumber(tx, branchId);

    const order = await tx.order.create({
      data: {
        branchId,
        orderNumber,
        posSessionId,
        customerId,
        source,
        orderType,
        status: "completed",
        subtotal,
        discountAmount: discount,
        taxAmount,
        total,
        cogs: round(totalCogs, 4),
        amountPaid: total,
        currency: "THB",
        customerNotes,
        createdById: userId,
        confirmedAt: new Date(),
        completedAt: new Date(),
        items: { createMany: { data: orderItemsData } },
        payments: {
          create: {
            paymentMethod,
            amount: total,
            status: "completed",
          },
        },
        statusHistory: {
          create: { newStatus: "completed", changedById: userId },
        },
      },
      include: { items: true, payments: true },
    });

    // Ledger rows — one 'sale' movement per ingredient consumed.
    if (ingredientNeed.size > 0) {
      await tx.stockMovement.createMany({
        data: [...ingredientNeed.entries()].map(([ingredientId, need]) => ({
          branchId,
          ingredientId,
          movementType: "sale",
          quantity: need.qty,
          direction: "out",
          unitCost: need.unitCost,
          totalValue: round(need.qty * need.unitCost, 4),
          referenceType: "order",
          referenceId: order.id,
          performedById: userId,
        })),
      });
    }

    // Roll session totals forward.
    if (posSessionId) {
      await tx.posSession.update({
        where: { id: posSessionId },
        data: {
          totalSales: { increment: total },
          totalOrders: { increment: 1 },
        },
      });
    }

    // Record the promo redemption and count it against the cap (guarded so a
    // concurrent sale can't push past max_redemptions).
    if (promo && promoDiscount > 0) {
      const bumped = await tx.$executeRaw`
        UPDATE "Promotion"
        SET "timesRedeemed" = "timesRedeemed" + 1,
            "updatedAt" = ${new Date()}
        WHERE "id" = ${promo.promotionId}
          AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")
      `;
      if (bumped === 0) {
        throw new PromoError("This promotion has reached its redemption limit.");
      }
      await tx.promoRedemption.create({
        data: {
          promotionId: promo.promotionId,
          orderId: order.id,
          branchId,
          customerId,
          discountAmount: promoDiscount,
        },
      });
    }

    // Update customer loyalty/spend.
    if (customerId) {
      await tx.customer.update({
        where: { id: customerId },
        data: {
          totalSpent: { increment: total },
          visitCount: { increment: 1 },
          loyaltyPoints: { increment: Math.floor(total / 10) }, // 1 pt / ฿10
        },
      });
    }

    return { order, appliedPromo: promo };
  });
}
