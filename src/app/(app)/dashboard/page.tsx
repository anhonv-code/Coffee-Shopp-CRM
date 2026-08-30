import { requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/analytics";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { SalesChart } from "./sales-chart";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboard(user, 14);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Performance, P&L, and stock health for the last 14 days"
      />

      {/* Today */}
      <div className="mb-2 text-sm font-semibold text-coffee-700">Today</div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatMoney(data.today.revenue)}
          accent="green"
        />
        <StatCard label="COGS" value={formatMoney(data.today.cogs)} accent="amber" />
        <StatCard
          label="Gross margin"
          value={formatPercent(data.today.margin)}
          hint={formatMoney(data.today.revenue - data.today.cogs) + " profit"}
        />
        <StatCard label="Orders" value={formatNumber(data.today.orders)} />
      </div>

      {/* Chart + side panels */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-coffee-800">
              Revenue &amp; profit (14 days)
            </h2>
            <div className="text-right text-xs text-coffee-500">
              Period revenue{" "}
              <b className="text-coffee-800">
                {formatMoney(data.period.revenue)}
              </b>{" "}
              · margin{" "}
              <b className="text-coffee-800">
                {formatPercent(data.period.margin)}
              </b>
            </div>
          </div>
          <SalesChart data={data.series} />
        </div>

        <div className="space-y-6">
          {/* Low stock */}
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-coffee-800">Low stock</h2>
              {data.lowStock.length > 0 && (
                <Badge color="red">{data.lowStock.length} to reorder</Badge>
              )}
            </div>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-coffee-400">
                All ingredients above reorder level.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.lowStock.slice(0, 6).map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-coffee-700">{i.name}</span>
                    <span className="text-red-600">
                      {formatNumber(i.current, 2)} / {formatNumber(i.reorder, 2)}{" "}
                      {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Payment mix */}
          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-coffee-800">
              Payment mix (14 days)
            </h2>
            {data.payments.length === 0 ? (
              <p className="text-sm text-coffee-400">No payments yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.payments.map((p) => (
                  <li
                    key={p.method}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-coffee-700">
                      {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    </span>
                    <span className="font-medium text-coffee-800">
                      {formatMoney(p.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Top products */}
      <div className="mt-6 card p-5">
        <h2 className="mb-4 font-semibold text-coffee-800">
          Top products (14 days)
        </h2>
        {data.topProducts.length === 0 ? (
          <EmptyState>No sales in this period.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-coffee-400">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Qty sold</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p) => (
                  <tr key={p.name} className="border-t border-coffee-100">
                    <td className="py-2 text-coffee-800">{p.name}</td>
                    <td className="py-2 text-right text-coffee-600">
                      {formatNumber(p.qty)}
                    </td>
                    <td className="py-2 text-right font-medium text-coffee-800">
                      {formatMoney(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
