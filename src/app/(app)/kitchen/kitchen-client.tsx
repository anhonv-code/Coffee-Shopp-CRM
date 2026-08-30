"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui";

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
}
interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: string;
  source: string;
  orderType: string;
  total: number;
  createdAt: string;
  customer: string | null;
  customerNotes: string | null;
  items: OrderItem[];
}

const COLUMNS: { status: string; label: string; color: "gray" | "blue" | "amber" | "green" }[] = [
  { status: "pending", label: "New", color: "gray" },
  { status: "confirmed", label: "Confirmed", color: "blue" },
  { status: "preparing", label: "Preparing", color: "amber" },
  { status: "ready", label: "Ready", color: "green" },
];

const NEXT_ACTION: Record<string, { to: string; label: string }> = {
  pending: { to: "confirmed", label: "Confirm" },
  confirmed: { to: "preparing", label: "Start" },
  preparing: { to: "ready", label: "Mark ready" },
  ready: { to: "completed", label: "Complete" },
};

function minutesAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

export function KitchenClient({
  branchId,
  orders,
}: {
  branchId: string;
  orders: KitchenOrder[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll for new/updated orders. (Socket.IO can replace this later.)
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [router]);

  async function move(order: KitchenOrder, to: string, cancelReason?: string) {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId, status: to, cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Could not update the order.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="card p-8 text-center text-sm text-coffee-400">
          No active orders. New orders will appear here automatically.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter((o) => o.status === col.status);
            return (
              <div key={col.status} className="rounded-xl bg-coffee-100/60 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="font-semibold text-coffee-800">{col.label}</span>
                  <Badge color={col.color}>{colOrders.length}</Badge>
                </div>
                <div className="space-y-3">
                  {colOrders.map((o) => {
                    const action = NEXT_ACTION[o.status];
                    return (
                      <div key={o.id} className="card p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-coffee-900">
                            {o.orderNumber}
                          </span>
                          <span className="text-xs text-coffee-400">
                            {minutesAgo(o.createdAt)}
                          </span>
                        </div>
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-coffee-500">
                          <span className="capitalize">{o.source}</span>·
                          <span className="capitalize">{o.orderType.replace("_", " ")}</span>
                          {o.customer && <span>· {o.customer}</span>}
                        </div>
                        <ul className="mb-2 space-y-0.5 text-sm text-coffee-700">
                          {o.items.map((it) => (
                            <li key={it.id}>
                              <span className="font-medium">{it.quantity}×</span> {it.name}
                              {it.notes && (
                                <span className="text-xs text-amber-600"> — {it.notes}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {o.customerNotes && (
                          <p className="mb-2 text-xs italic text-coffee-500">
                            “{o.customerNotes}”
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          {action && (
                            <button
                              className="btn-primary flex-1 py-1.5 text-xs"
                              disabled={busyId === o.id}
                              onClick={() => move(o, action.to)}
                            >
                              {action.label}
                            </button>
                          )}
                          {o.status !== "ready" && (
                            <button
                              className="btn-ghost py-1.5 text-xs"
                              disabled={busyId === o.id}
                              onClick={() => move(o, "cancelled", "Cancelled from kitchen")}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {colOrders.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-coffee-400">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
