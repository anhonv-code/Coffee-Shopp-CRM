"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import type { MenuCategory } from "@/lib/catalog";

interface Branch {
  id: string;
  name: string;
  code: string;
}
interface CartItem {
  variantId: string;
  label: string;
  price: number;
  qty: number;
}

const TAX_RATE = 0.07;

export function OrderClient({
  branch,
  branches,
  menu,
}: {
  branch: Branch;
  branches: Branch[];
  menu: MenuCategory[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<"takeaway" | "delivery">("takeaway");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<{ orderNumber: string; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function add(variantId: string, product: string, variant: string, price: number) {
    setCart((prev) => {
      const ex = prev[variantId];
      return {
        ...prev,
        [variantId]: {
          variantId,
          label: `${product} · ${variant}`,
          price,
          qty: ex ? ex.qty + 1 : 1,
        },
      };
    });
  }
  function changeQty(variantId: string, delta: number) {
    setCart((prev) => {
      const item = prev[variantId];
      if (!item) return prev;
      const qty = item.qty + delta;
      const next = { ...prev };
      if (qty <= 0) delete next[variantId];
      else next[variantId] = { ...item, qty };
      return next;
    });
  }

  const lines = Object.values(cart);
  const subtotal = useMemo(() => lines.reduce((s, i) => s + i.price * i.qty, 0), [lines]);
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  async function placeOrder() {
    if (!lines.length || !name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: branch.id,
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
          orderType,
          notes: notes.trim() || undefined,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Sorry, we couldn't place your order.");
        return;
      }
      setPlaced({ orderNumber: data.orderNumber, total: Number(data.total) });
      setCart({});
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (placed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="text-2xl font-bold text-coffee-900">Order placed!</h1>
        <p className="mt-2 text-coffee-600">
          Your order <b>{placed.orderNumber}</b> is in the queue.
        </p>
        <p className="text-coffee-500">Pay {formatMoney(placed.total)} on pickup.</p>
        <button
          className="btn-primary mt-6"
          onClick={() => {
            setPlaced(null);
            setName("");
            setPhone("");
            setNotes("");
            router.refresh();
          }}
        >
          Order again
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl">☕</span>
          <div>
            <h1 className="text-xl font-bold text-coffee-900">Coffee Shopp</h1>
            <p className="text-xs text-coffee-500">Order online for pickup</p>
          </div>
        </div>
        {branches.length > 1 && (
          <select
            className="input max-w-[220px]"
            value={branch.id}
            onChange={(e) => router.push(`/order?branch=${e.target.value}`)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Menu */}
        <div className="space-y-6">
          {menu.map((cat) => (
            <section key={cat.id}>
              <h2 className="mb-2 font-semibold text-coffee-800">{cat.name}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cat.products.flatMap((p) =>
                  p.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => add(v.id, p.name, v.name, v.price)}
                      className="card p-3 text-left transition-transform hover:-translate-y-0.5"
                    >
                      <div className="font-medium text-coffee-900">{p.name}</div>
                      <div className="text-xs text-coffee-500">
                        {v.name}
                        {v.sizeLabel ? ` (${v.sizeLabel})` : ""}
                      </div>
                      <div className="mt-2 font-semibold text-coffee-700">
                        {formatMoney(v.price)}
                      </div>
                    </button>
                  )),
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Cart */}
        <div className="card h-fit p-5 lg:sticky lg:top-4">
          <h2 className="mb-3 font-semibold text-coffee-800">Your order</h2>
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-coffee-400">
              Tap items to add them.
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {lines.map((item) => (
                <li key={item.variantId} className="flex items-center gap-2 text-sm">
                  <div className="flex-1">
                    <div className="text-coffee-800">{item.label}</div>
                    <div className="text-xs text-coffee-500">{formatMoney(item.price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => changeQty(item.variantId, -1)}
                      className="h-6 w-6 rounded bg-coffee-100 text-coffee-700"
                    >
                      −
                    </button>
                    <span className="w-6 text-center">{item.qty}</span>
                    <button
                      onClick={() => changeQty(item.variantId, 1)}
                      className="h-6 w-6 rounded bg-coffee-100 text-coffee-700"
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-coffee-100 pt-4">
            <input
              className="input"
              placeholder="Your name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <select
              className="input"
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as "takeaway" | "delivery")}
            >
              <option value="takeaway">Takeaway</option>
              <option value="delivery">Delivery</option>
            </select>
            <input
              className="input"
              placeholder="Notes (e.g. less sugar)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="mt-4 space-y-1 border-t border-coffee-100 pt-4 text-sm">
            <div className="flex justify-between text-coffee-600">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-coffee-600">
              <span>VAT (7%)</span>
              <span>{formatMoney(tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-coffee-900">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            className="btn-primary mt-4 w-full"
            disabled={!lines.length || !name.trim() || submitting}
            onClick={placeOrder}
          >
            {submitting ? "Placing…" : "Place order"}
          </button>
          <p className="mt-2 text-center text-xs text-coffee-400">
            Pay on pickup. No account needed.
          </p>
        </div>
      </div>
    </main>
  );
}
