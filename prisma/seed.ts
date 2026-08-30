import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function round(v: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round((v + Number.EPSILON) * f) / f;
}

async function main() {
  console.log("🌱  Seeding Coffee Shopp CRM…");

  // --- reset (dev only) ----------------------------------------------------
  // Delete in FK-safe order.
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

  // --- branches ------------------------------------------------------------
  const bkk1 = await prisma.branch.create({
    data: {
      name: "Coffee Shopp — Siam",
      code: "BKK-01",
      address: "999 Rama I Rd, Pathum Wan, Bangkok",
      phone: "02-111-1111",
    },
  });
  const bkk2 = await prisma.branch.create({
    data: {
      name: "Coffee Shopp — Thonglor",
      code: "BKK-02",
      address: "55 Sukhumvit 55, Watthana, Bangkok",
      phone: "02-222-2222",
    },
  });

  // --- users ---------------------------------------------------------------
  const pwd = await bcrypt.hash("password123", 10);
  await prisma.user.createMany({
    data: [
      {
        email: "admin@coffeeshopp.com",
        name: "System Admin",
        passwordHash: pwd,
        role: "SUPER_ADMIN",
        branchId: null,
      },
      {
        email: "manager@coffeeshopp.com",
        name: "Siam Manager",
        passwordHash: pwd,
        role: "BRANCH_MANAGER",
        branchId: bkk1.id,
      },
      {
        email: "barista@coffeeshopp.com",
        name: "Siam Barista",
        passwordHash: pwd,
        role: "BARISTA",
        branchId: bkk1.id,
      },
    ],
  });
  const barista = await prisma.user.findUniqueOrThrow({
    where: { email: "barista@coffeeshopp.com" },
  });

  // --- ingredients (stockable) --------------------------------------------
  type IngSpec = {
    key: string;
    name: string;
    unit: string;
    unitCost: number;
    stock: number;
    reorder: number;
  };
  const ingSpecs: IngSpec[] = [
    { key: "beans", name: "Espresso Beans", unit: "g", unitCost: 0.12, stock: 5000, reorder: 1000 },
    { key: "milk", name: "Fresh Milk", unit: "ml", unitCost: 0.045, stock: 20000, reorder: 5000 },
    { key: "oatmilk", name: "Oat Milk", unit: "ml", unitCost: 0.09, stock: 800, reorder: 2000 },
    { key: "water", name: "Filtered Water", unit: "ml", unitCost: 0.001, stock: 100000, reorder: 10000 },
    { key: "sugar", name: "Sugar Syrup", unit: "ml", unitCost: 0.02, stock: 6000, reorder: 1000 },
    { key: "choco", name: "Chocolate Sauce", unit: "ml", unitCost: 0.15, stock: 3000, reorder: 500 },
    { key: "matcha", name: "Matcha Powder", unit: "g", unitCost: 0.8, stock: 900, reorder: 200 },
    { key: "cupS", name: "Cup (S)", unit: "pcs", unitCost: 1.2, stock: 500, reorder: 100 },
    { key: "cupM", name: "Cup (M)", unit: "pcs", unitCost: 1.5, stock: 480, reorder: 100 },
    { key: "cupL", name: "Cup (L)", unit: "pcs", unitCost: 1.8, stock: 200, reorder: 100 },
    { key: "lid", name: "Cup Lid", unit: "pcs", unitCost: 0.5, stock: 1200, reorder: 300 },
    { key: "croissant", name: "Croissant (frozen)", unit: "pcs", unitCost: 18, stock: 60, reorder: 20 },
  ];
  const ing: Record<string, { id: string; unit: string; unitCost: number }> = {};
  for (const s of ingSpecs) {
    const created = await prisma.ingredient.create({
      data: {
        branchId: bkk1.id,
        name: s.name,
        unit: s.unit,
        unitCost: s.unitCost,
        reorderLevel: s.reorder,
        currentStock: s.stock,
        stockValue: round(s.stock * s.unitCost, 2),
        sku: `${bkk1.code}-${s.key.toUpperCase()}`,
      },
    });
    ing[s.key] = { id: created.id, unit: s.unit, unitCost: s.unitCost };
  }

  // --- categories ----------------------------------------------------------
  const catCoffee = await prisma.category.create({
    data: { branchId: bkk1.id, name: "Coffee", sortOrder: 1 },
  });
  const catTea = await prisma.category.create({
    data: { branchId: bkk1.id, name: "Tea & Others", sortOrder: 2 },
  });
  const catBakery = await prisma.category.create({
    data: { branchId: bkk1.id, name: "Bakery", sortOrder: 3 },
  });

  // --- products, variants, recipes ----------------------------------------
  // Helper: create a product with variants, each variant carrying a recipe
  // (a list of [ingredientKey, quantity]).
  type RecipeSpec = [string, number][];
  type VariantSpec = { name: string; price: number; size?: string; recipe: RecipeSpec };
  async function makeProduct(
    categoryId: string,
    name: string,
    basePrice: number,
    variants: VariantSpec[],
  ) {
    const product = await prisma.product.create({
      data: { branchId: bkk1.id, categoryId, name, basePrice },
    });
    for (const [i, v] of variants.entries()) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: v.name,
          price: v.price,
          sizeLabel: v.size,
          isDefault: i === 0,
        },
      });
      const items = v.recipe.map(([key, qty], idx) => {
        const it = ing[key];
        return {
          ingredientId: it.id,
          quantity: qty,
          unit: it.unit,
          sortOrder: idx,
          lineCost: round(qty * it.unitCost, 4),
        };
      });
      const totalCost = round(
        items.reduce((s, it) => s + Number(it.lineCost), 0),
        4,
      );
      await prisma.recipe.create({
        data: {
          variantId: variant.id,
          branchId: bkk1.id,
          totalCost,
          items: { createMany: { data: items } },
        },
      });
    }
    return product;
  }

  await makeProduct(catCoffee.id, "Espresso", 55, [
    { name: "Single", price: 55, size: "S", recipe: [["beans", 9], ["cupS", 1], ["lid", 1]] },
    { name: "Double", price: 65, size: "S", recipe: [["beans", 18], ["cupS", 1], ["lid", 1]] },
  ]);
  await makeProduct(catCoffee.id, "Americano", 60, [
    { name: "Hot", price: 60, size: "M", recipe: [["beans", 18], ["water", 180], ["cupM", 1], ["lid", 1]] },
    { name: "Iced", price: 65, size: "L", recipe: [["beans", 18], ["water", 250], ["cupL", 1], ["lid", 1]] },
  ]);
  await makeProduct(catCoffee.id, "Latte", 70, [
    { name: "Medium", price: 70, size: "M", recipe: [["beans", 18], ["milk", 200], ["cupM", 1], ["lid", 1]] },
    { name: "Large", price: 80, size: "L", recipe: [["beans", 18], ["milk", 280], ["cupL", 1], ["lid", 1]] },
    { name: "Oat", price: 90, size: "M", recipe: [["beans", 18], ["oatmilk", 200], ["cupM", 1], ["lid", 1]] },
  ]);
  await makeProduct(catCoffee.id, "Cappuccino", 70, [
    { name: "Medium", price: 70, size: "M", recipe: [["beans", 18], ["milk", 180], ["cupM", 1], ["lid", 1]] },
  ]);
  await makeProduct(catCoffee.id, "Mocha", 85, [
    { name: "Medium", price: 85, size: "M", recipe: [["beans", 18], ["milk", 180], ["choco", 30], ["cupM", 1], ["lid", 1]] },
  ]);
  await makeProduct(catTea.id, "Matcha Latte", 90, [
    { name: "Medium", price: 90, size: "M", recipe: [["matcha", 4], ["milk", 220], ["sugar", 15], ["cupM", 1], ["lid", 1]] },
  ]);
  await makeProduct(catBakery.id, "Butter Croissant", 65, [
    { name: "Each", price: 65, recipe: [["croissant", 1]] },
  ]);

  // --- suppliers -----------------------------------------------------------
  await prisma.supplier.create({
    data: {
      branchId: bkk1.id,
      name: "Bean Bros Roastery",
      contactPerson: "Nok",
      phone: "081-234-5678",
      leadTimeDays: 2,
    },
  });
  await prisma.supplier.create({
    data: {
      branchId: bkk1.id,
      name: "Fresh Dairy Co.",
      contactPerson: "Ann",
      phone: "089-876-5432",
      leadTimeDays: 1,
    },
  });

  // --- customers -----------------------------------------------------------
  const customers = await Promise.all(
    [
      { name: "Somchai P.", phone: "0812345678" },
      { name: "Nadia K.", phone: "0898765432" },
      { name: "Walk-in Regular", phone: "0855555555" },
    ].map((c) =>
      prisma.customer.create({ data: { branchId: bkk1.id, ...c } }),
    ),
  );

  // --- a promotion ---------------------------------------------------------
  await prisma.promotion.create({
    data: {
      branchId: bkk1.id,
      name: "Morning 10% Off",
      code: "MORNING10",
      promoType: "percentage_off",
      discountValue: 10,
      minOrderValue: 0,
      startDate: new Date(),
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
      timeStart: "07:00",
      timeEnd: "10:00",
    },
  });

  // --- historical orders (to populate the dashboard) -----------------------
  // Replays realistic sales across the last 14 days, deducting stock and
  // writing ledger rows just like the live POS path would.
  const variants = await prisma.productVariant.findMany({
    include: { product: true, recipe: { include: { items: true } } },
  });

  let orderCounter = 0;
  for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
    const base = new Date();
    base.setDate(base.getDate() - daysAgo);
    // weekends busier
    const isWeekend = [0, 6].includes(base.getDay());
    const orderCount = (isWeekend ? 22 : 14) + Math.floor(Math.random() * 8);

    for (let o = 0; o < orderCount; o++) {
      const when = new Date(base);
      when.setHours(7 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));

      const lineCount = 1 + Math.floor(Math.random() * 3);
      let subtotal = 0;
      let cogs = 0;
      const itemsData: Prisma.OrderItemCreateManyOrderInput[] = [];
      const movements: Prisma.StockMovementCreateManyInput[] = [];

      orderCounter++;
      const orderNo = `ORD-${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, "0")}${String(when.getDate()).padStart(2, "0")}-${String(o + 1).padStart(4, "0")}`;

      const orderId = `seed_${orderCounter}`;
      for (let l = 0; l < lineCount; l++) {
        const v = variants[Math.floor(Math.random() * variants.length)];
        const qty = 1 + Math.floor(Math.random() * 2);
        const unitPrice = Number(v.price);
        const lineTotal = round(unitPrice * qty, 2);
        subtotal += lineTotal;
        // COGS from the recipe's denormalized total cost.
        const variantCogs = Number(v.recipe?.totalCost ?? 0);
        const lineCogs = round(variantCogs * qty, 4);
        cogs += lineCogs;
        itemsData.push({
          variantId: v.id,
          productName: v.product.name,
          variantName: v.name,
          quantity: qty,
          unitPrice,
          lineTotal,
          cogs: lineCogs,
        });
        for (const ri of v.recipe?.items ?? []) {
          movements.push({
            branchId: bkk1.id,
            ingredientId: ri.ingredientId,
            movementType: "sale",
            quantity: Number(ri.quantity) * qty,
            direction: "out",
            unitCost: 0, // snapshot omitted for seed brevity
            totalValue: Number(ri.lineCost) * qty,
            referenceType: "order",
            referenceId: orderId,
            performedById: barista.id,
            createdAt: when,
          });
        }
      }

      const total = round(subtotal, 2);
      const customer = Math.random() < 0.4 ? customers[Math.floor(Math.random() * customers.length)] : null;

      await prisma.order.create({
        data: {
          id: orderId,
          branchId: bkk1.id,
          orderNumber: orderNo,
          source: Math.random() < 0.8 ? "pos" : "online",
          orderType: Math.random() < 0.7 ? "dine_in" : "takeaway",
          status: "completed",
          subtotal,
          total,
          cogs: round(cogs, 4),
          amountPaid: total,
          customerId: customer?.id ?? null,
          createdById: barista.id,
          createdAt: when,
          completedAt: when,
          confirmedAt: when,
          items: { createMany: { data: itemsData } },
          payments: {
            create: {
              paymentMethod: Math.random() < 0.5 ? "cash" : "promptpay",
              amount: total,
              paidAt: when,
            },
          },
        },
      });
      if (movements.length) {
        await prisma.stockMovement.createMany({ data: movements });
      }
    }
  }

  console.log(`✅  Seed complete: 2 branches, 3 users, ${ingSpecs.length} ingredients, ${variants.length} variants, ${orderCounter} historical orders.`);
  console.log("");
  console.log("   Login accounts (password: password123):");
  console.log("   • admin@coffeeshopp.com     (Super Admin — all branches)");
  console.log("   • manager@coffeeshopp.com   (Branch Manager — Siam)");
  console.log("   • barista@coffeeshopp.com   (Barista — Siam)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
