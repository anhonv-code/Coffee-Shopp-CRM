import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/lib/rbac";
import { toNumber } from "@/lib/decimal";
import { formatMoney, formatPercent } from "@/lib/format";
import { PageHeader, Badge, EmptyState } from "@/components/ui";

export default async function ProductsPage() {
  const user = await requireUser();
  const scope = branchScope(user);

  const products = await prisma.product.findMany({
    where: scope,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      category: true,
      variants: {
        orderBy: { price: "asc" },
        include: {
          recipe: {
            include: {
              items: { include: { ingredient: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Products & Recipes"
        subtitle="Menu items, their variants, and the recipe (BOM) that drives cost"
      />

      {products.length === 0 ? (
        <EmptyState>No products yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {products.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-coffee-900">{p.name}</h2>
                  {p.category && (
                    <span className="text-xs text-coffee-400">
                      {p.category.name}
                    </span>
                  )}
                </div>
                {!p.isActive && <Badge color="gray">Inactive</Badge>}
              </div>

              <div className="space-y-3">
                {p.variants.map((v) => {
                  const price = toNumber(v.price);
                  const cost = toNumber(v.recipe?.totalCost);
                  const margin =
                    price > 0 ? ((price - cost) / price) * 100 : 0;
                  return (
                    <div
                      key={v.id}
                      className="rounded-lg border border-coffee-100 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-coffee-800">
                          {v.name}
                          {v.sizeLabel ? (
                            <span className="ml-1 text-xs text-coffee-400">
                              ({v.sizeLabel})
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-coffee-700">
                            Price {formatMoney(price)}
                          </span>
                          <span className="text-amber-600">
                            Cost {formatMoney(cost)}
                          </span>
                          <Badge color={margin >= 60 ? "green" : "amber"}>
                            {formatPercent(margin)} margin
                          </Badge>
                        </div>
                      </div>

                      {v.recipe && v.recipe.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {v.recipe.items.map((it) => (
                            <span
                              key={it.id}
                              className="rounded bg-coffee-50 px-2 py-0.5 text-xs text-coffee-600"
                            >
                              {it.ingredient.name}: {toNumber(it.quantity)}
                              {it.unit}
                            </span>
                          ))}
                        </div>
                      )}
                      {!v.recipe && (
                        <div className="mt-2 text-xs text-coffee-400">
                          No recipe defined — COGS will be 0.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
