import "server-only";
import { prisma } from "./prisma";
import { toNumber } from "./decimal";

export interface MenuVariant {
  id: string;
  name: string;
  price: number;
  sizeLabel: string | null;
  cost: number;
}
export interface MenuProduct {
  id: string;
  name: string;
  variants: MenuVariant[];
}
export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}

/** Load the sellable menu for a branch, grouped by category. */
export async function getMenu(branchId: string): Promise<MenuCategory[]> {
  const products = await prisma.product.findMany({
    where: { branchId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      category: true,
      variants: {
        where: { isActive: true },
        orderBy: { price: "asc" },
        include: { recipe: { select: { totalCost: true } } },
      },
    },
  });

  const byCat = new Map<string, MenuCategory>();
  const uncategorizedKey = "__uncat__";

  for (const p of products) {
    const catId = p.category?.id ?? uncategorizedKey;
    const catName = p.category?.name ?? "Other";
    if (!byCat.has(catId)) {
      byCat.set(catId, { id: catId, name: catName, products: [] });
    }
    byCat.get(catId)!.products.push({
      id: p.id,
      name: p.name,
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        price: toNumber(v.price),
        sizeLabel: v.sizeLabel,
        cost: toNumber(v.recipe?.totalCost),
      })),
    });
  }

  return [...byCat.values()];
}
