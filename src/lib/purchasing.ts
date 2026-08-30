import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber, round } from "./decimal";

export class PurchaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseError";
  }
}

export interface NewPurchaseLine {
  ingredientId: string;
  quantityOrdered: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  branchId: string;
  userId: string;
  supplierId: string;
  lines: NewPurchaseLine[];
  expectedDate?: string | null;
  notes?: string | null;
}

/** Generate a per-branch, per-day PO number: PO-YYYYMMDD-0007 */
async function nextPoNumber(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<string> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const countToday = await tx.stockPurchase.count({
    where: { branchId, createdAt: { gte: startOfDay } },
  });
  return `PO-${y}${m}${d}-${String(countToday + 1).padStart(4, "0")}`;
}

/** Create a purchase order (status "ordered") with its line items. */
export async function createPurchaseOrder(input: CreatePurchaseInput) {
  const { branchId, userId, supplierId, lines } = input;
  if (!lines.length) throw new PurchaseError("A purchase order needs at least one item.");

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: supplierId, OR: [{ branchId }, { branchId: null }] },
    });
    if (!supplier) throw new PurchaseError("Supplier not found for this branch.");

    let total = 0;
    const itemsData = lines.map((l) => {
      const lineTotal = round(l.quantityOrdered * l.unitCost, 2);
      total += lineTotal;
      return {
        ingredientId: l.ingredientId,
        quantityOrdered: l.quantityOrdered,
        unitCost: l.unitCost,
        lineTotal,
      };
    });

    const poNumber = await nextPoNumber(tx, branchId);
    return tx.stockPurchase.create({
      data: {
        branchId,
        supplierId,
        poNumber,
        status: "ordered",
        orderDate: new Date(),
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        totalCost: round(total, 2),
        notes: input.notes ?? null,
        createdById: userId,
        items: { createMany: { data: itemsData } },
      },
      include: { items: true },
    });
  });
}

export interface ReceiveLine {
  itemId: string;
  quantity: number;
}

/**
 * Receive stock against a purchase order. For each line it:
 *   - adds the received quantity to the ingredient (moving-average cost update),
 *   - writes a 'purchase' ledger row (direction 'in'),
 *   - records the received quantity on the line.
 * Then it advances the PO status to 'partial' or 'received'.
 *
 * `lines` lets you receive specific quantities; omit it to receive every
 * outstanding quantity in full.
 */
export async function receivePurchase(opts: {
  purchaseId: string;
  branchId: string;
  userId: string;
  lines?: ReceiveLine[];
}) {
  const { purchaseId, branchId, userId, lines } = opts;

  return prisma.$transaction(async (tx) => {
    const po = await tx.stockPurchase.findUnique({
      where: { id: purchaseId },
      include: { items: true },
    });
    if (!po || po.branchId !== branchId)
      throw new PurchaseError("Purchase order not found for this branch.");
    if (po.status === "received")
      throw new PurchaseError("This purchase order is already fully received.");
    if (po.status === "cancelled")
      throw new PurchaseError("This purchase order was cancelled.");

    const requested = new Map(lines?.map((l) => [l.itemId, l.quantity]) ?? []);

    let receivedAnything = false;
    for (const item of po.items) {
      const outstanding = toNumber(item.quantityOrdered) - toNumber(item.quantityReceived);
      if (outstanding <= 0) continue;
      const qty = lines ? (requested.get(item.id) ?? 0) : outstanding;
      if (qty <= 0) continue;
      if (qty > outstanding)
        throw new PurchaseError(
          `Cannot receive more than the outstanding quantity for one of the items (${outstanding} left).`,
        );

      const lineUnitCost = toNumber(item.unitCost);

      // Moving-average cost: blend the existing stock's cost with the incoming.
      const ing = await tx.ingredient.findUniqueOrThrow({
        where: { id: item.ingredientId },
      });
      const curStock = toNumber(ing.currentStock);
      const curCost = toNumber(ing.unitCost);
      const newStock = round(curStock + qty, 4);
      const blendedCost =
        newStock > 0
          ? round((curStock * curCost + qty * lineUnitCost) / newStock, 4)
          : lineUnitCost;

      await tx.ingredient.update({
        where: { id: item.ingredientId },
        data: {
          currentStock: newStock,
          unitCost: blendedCost,
          stockValue: round(newStock * blendedCost, 2),
        },
      });

      await tx.stockMovement.create({
        data: {
          branchId,
          ingredientId: item.ingredientId,
          movementType: "purchase",
          quantity: qty,
          direction: "in",
          unitCost: lineUnitCost,
          totalValue: round(qty * lineUnitCost, 2),
          referenceType: "purchase",
          referenceId: po.id,
          performedById: userId,
        },
      });

      await tx.purchaseItem.update({
        where: { id: item.id },
        data: {
          quantityReceived: round(toNumber(item.quantityReceived) + qty, 4),
          receivedAt: new Date(),
        },
      });
      receivedAnything = true;
    }

    if (!receivedAnything)
      throw new PurchaseError("Nothing to receive on this purchase order.");

    // Re-evaluate status from the updated lines.
    const fresh = await tx.purchaseItem.findMany({ where: { purchaseId: po.id } });
    const fullyReceived = fresh.every(
      (i) => toNumber(i.quantityReceived) >= toNumber(i.quantityOrdered),
    );
    return tx.stockPurchase.update({
      where: { id: po.id },
      data: {
        status: fullyReceived ? "received" : "partial",
        receivedDate: fullyReceived ? new Date() : po.receivedDate,
      },
      include: { items: true },
    });
  });
}
