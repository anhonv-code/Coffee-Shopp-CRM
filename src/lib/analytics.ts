import "server-only";
import { prisma } from "./prisma";
import { toNumber, round } from "./decimal";
import { branchScope } from "./rbac";

interface ScopeUser {
  role: string;
  branchId: string | null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

export interface DashboardData {
  today: { revenue: number; cogs: number; margin: number; orders: number };
  period: { revenue: number; cogs: number; margin: number; orders: number };
  series: { date: string; revenue: number; cogs: number; profit: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  lowStock: { id: string; name: string; unit: string; current: number; reorder: number }[];
  payments: { method: string; amount: number }[];
}

export async function getDashboard(
  user: ScopeUser,
  periodDays = 14,
): Promise<DashboardData> {
  const scope = branchScope(user);
  const since = daysAgo(periodDays - 1);
  const todayStart = startOfToday();

  const orders = await prisma.order.findMany({
    where: {
      ...scope,
      status: "completed",
      createdAt: { gte: since },
    },
    select: {
      total: true,
      cogs: true,
      createdAt: true,
      items: { select: { productName: true, quantity: true, lineTotal: true } },
      payments: { select: { paymentMethod: true, amount: true, status: true } },
    },
  });

  // Daily buckets
  const buckets = new Map<string, { revenue: number; cogs: number }>();
  for (let i = periodDays - 1; i >= 0; i--) {
    const key = daysAgo(i).toISOString().slice(0, 10);
    buckets.set(key, { revenue: 0, cogs: 0 });
  }

  let periodRevenue = 0;
  let periodCogs = 0;
  let todayRevenue = 0;
  let todayCogs = 0;
  let todayOrders = 0;

  const productAgg = new Map<string, { qty: number; revenue: number }>();
  const paymentAgg = new Map<string, number>();

  for (const o of orders) {
    const rev = toNumber(o.total);
    const cogs = toNumber(o.cogs);
    periodRevenue += rev;
    periodCogs += cogs;

    const key = o.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.revenue += rev;
      b.cogs += cogs;
    }

    if (o.createdAt >= todayStart) {
      todayRevenue += rev;
      todayCogs += cogs;
      todayOrders += 1;
    }

    for (const it of o.items) {
      const p = productAgg.get(it.productName) ?? { qty: 0, revenue: 0 };
      p.qty += it.quantity;
      p.revenue += toNumber(it.lineTotal);
      productAgg.set(it.productName, p);
    }
    for (const pay of o.payments) {
      if (pay.status !== "completed") continue;
      paymentAgg.set(
        pay.paymentMethod,
        (paymentAgg.get(pay.paymentMethod) ?? 0) + toNumber(pay.amount),
      );
    }
  }

  const series = [...buckets.entries()].map(([date, v]) => ({
    date,
    revenue: round(v.revenue),
    cogs: round(v.cogs),
    profit: round(v.revenue - v.cogs),
  }));

  const topProducts = [...productAgg.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const payments = [...paymentAgg.entries()]
    .map(([method, amount]) => ({ method, amount: round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Low stock ingredients within scope.
  const ingredients = await prisma.ingredient.findMany({
    where: { ...scope, isActive: true },
    select: {
      id: true,
      name: true,
      unit: true,
      currentStock: true,
      reorderLevel: true,
    },
  });
  const lowStock = ingredients
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      current: toNumber(i.currentStock),
      reorder: toNumber(i.reorderLevel),
    }))
    .filter((i) => i.current <= i.reorder)
    .sort((a, b) => a.current - b.current);

  const margin = (rev: number, cogs: number) =>
    rev > 0 ? round(((rev - cogs) / rev) * 100, 1) : 0;

  return {
    today: {
      revenue: round(todayRevenue),
      cogs: round(todayCogs),
      margin: margin(todayRevenue, todayCogs),
      orders: todayOrders,
    },
    period: {
      revenue: round(periodRevenue),
      cogs: round(periodCogs),
      margin: margin(periodRevenue, periodCogs),
      orders: orders.length,
    },
    series,
    topProducts,
    lowStock,
    payments,
  };
}
