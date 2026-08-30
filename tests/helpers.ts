import { prisma } from "../src/lib/prisma";

// Minimal, deterministic fixture for the integration tests. Runs against the
// database pointed to by DATABASE_URL (the test script uses a throwaway
// SQLite file). Returns the ids the tests need.
export async function resetAndSeed() {
  // FK-safe teardown.
  await prisma.promoRedemption.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.stockPurchase.deleteMany();
  await prisma.recipeItem.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.posSession.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();

  const branch = await prisma.branch.create({
    data: { name: "Test Branch", code: "TEST-01" },
  });
  const user = await prisma.user.create({
    data: {
      email: "test-barista@example.com",
      name: "Test Barista",
      passwordHash: "x",
      role: "BARISTA",
      branchId: branch.id,
    },
  });

  const beans = await prisma.ingredient.create({
    data: { branchId: branch.id, name: "Beans", unit: "g", unitCost: 0.12, currentStock: 5000, reorderLevel: 500 },
  });
  const milk = await prisma.ingredient.create({
    data: { branchId: branch.id, name: "Milk", unit: "ml", unitCost: 0.045, currentStock: 20000, reorderLevel: 2000 },
  });
  const cup = await prisma.ingredient.create({
    data: { branchId: branch.id, name: "Cup M", unit: "pcs", unitCost: 1.5, currentStock: 480, reorderLevel: 100 },
  });
  const oat = await prisma.ingredient.create({
    data: { branchId: branch.id, name: "Oat Milk", unit: "ml", unitCost: 0.09, currentStock: 400, reorderLevel: 2000 },
  });

  const product = await prisma.product.create({
    data: { branchId: branch.id, name: "Latte", basePrice: 70 },
  });

  async function makeVariant(
    name: string,
    price: number,
    recipe: [string, number][],
  ) {
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name, price },
    });
    const costMap: Record<string, number> = {
      [beans.id]: 0.12,
      [milk.id]: 0.045,
      [cup.id]: 1.5,
      [oat.id]: 0.09,
    };
    const unitMap: Record<string, string> = {
      [beans.id]: "g",
      [milk.id]: "ml",
      [cup.id]: "pcs",
      [oat.id]: "ml",
    };
    const items = recipe.map(([ingredientId, quantity], i) => ({
      ingredientId,
      quantity,
      unit: unitMap[ingredientId],
      sortOrder: i,
      lineCost: Math.round(quantity * costMap[ingredientId] * 10000) / 10000,
    }));
    const totalCost =
      Math.round(items.reduce((s, it) => s + it.lineCost, 0) * 10000) / 10000;
    await prisma.recipe.create({
      data: {
        variantId: variant.id,
        branchId: branch.id,
        totalCost,
        items: { createMany: { data: items } },
      },
    });
    return variant;
  }

  const latteMedium = await makeVariant("Medium", 70, [
    [beans.id, 18],
    [milk.id, 200],
    [cup.id, 1],
  ]);
  const latteOat = await makeVariant("Oat", 90, [
    [beans.id, 18],
    [oat.id, 200],
    [cup.id, 1],
  ]);

  const supplier = await prisma.supplier.create({
    data: { branchId: branch.id, name: "Test Supplier" },
  });

  const in90 = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);
  const promo = await prisma.promotion.create({
    data: {
      branchId: branch.id,
      name: "Welcome ฿50 Off",
      code: "WELCOME50",
      promoType: "fixed_off",
      discountValue: 50,
      minOrderValue: 100,
      startDate: new Date(Date.now() - 1000),
      endDate: in90,
    },
  });

  return {
    branch,
    user,
    ingredients: { beans, milk, cup, oat },
    variants: { latteMedium, latteOat },
    supplier,
    promo,
  };
}
