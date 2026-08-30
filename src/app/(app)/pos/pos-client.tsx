"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { MenuCategory } from "@/lib/catalog";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}
interface CartItem {
  variantId: string;
  label: string;
  price: number;
  qty: number;
}

const TAX_RATE = 0.07; // 7% VAT

export function PosClient({
  branchId,
  menu,
  customers,
}: {
  branchId: string;
  menu: MenuCategory[];
  customers: Customer[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [customerId, setCustomerId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [discount, setDiscount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<
    { type: "success" | "error"; text: string } | null
  >(null);

  const [activeCat, setActiveCat] = useState<string>(menu[0]?.id ?? "");

  function addToCart(
    variantId: string,
    productName: string,
    variantName: string,
    price: number,
  ) {
    setCart((prev) => {
      const existing = prev[variantId];
      const label = `${productName} · ${variantName}`;
      return {
        ...prev,
        [variantId]: {
          variantId,
          label,
          price,
          qty: existing ? existing.qty + 1 : 1,
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
  const subtotal = useMemo(
    () => lines.reduce((s, i) => s + i.price * i.qty, 0),
    [lines],
  );
  const clampedDiscount = Math.min(discount, subtotal);
  const taxable = subtotal - clampedDiscount;
  const tax = Math.round(taxable * TAX_RATE * 100) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;

  async function checkout() {
    if (!lines.length || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pos/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          customerId: customerId || null,
          paymentMethod,
          discountAmount: clampedDiscount,
          taxRate: TAX_RATE,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          type: "error",
          text:
            data.error === "insufficient_stock"
              ? data.message
              : (data.message ?? "Could not complete the sale."),
        });
        return;
      }
      setMessage({
        type: "success",
        text: `Order ${data.orderNumber} completed · ${formatMoney(data.total)}`,
      });
      setCart({});
      setDiscount(0);
      setCustomerId("");
      router.refresh(); // update dashboards / stock behind the scenes
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const activeCategory = menu.find((c) => c.id === activeCat) ?? menu[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Menu */}
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          {menu.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={
                cat.id === activeCategory?.id
                  ? "btn-primary"
                  : "btn-ghost"
              }
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {activeCategory?.products.flatMap((p) =>
            p.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => addToCart(v.id, p.name, v.name, v.price)}
                className="card p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-coffee-300"
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
          {activeCategory && activeCategory.products.length === 0 && (
            <p className="text-sm text-coffee-400">No products in this category.</p>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="card flex h-fit flex-col p-5 lg:sticky lg:top-6">
        <h2 className="mb-3 font-semibold text-coffee-800">Current order</h2>

        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-coffee-400">
            Tap a product to add it.
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {lines.map((item) => (
              <li key={item.variantId} className="flex items-center gap-2">
                <div className="flex-1">
                  <div className="text-sm text-coffee-800">{item.label}</div>
                  <div className="text-xs text-coffee-500">
                    {formatMoney(item.price)} each
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => changeQty(item.variantId, -1)}
                    className="h-6 w-6 rounded bg-coffee-100 text-coffee-700 hover:bg-coffee-200"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm">{item.qty}</span>
                  <button
                    onClick={() => changeQty(item.variantId, 1)}
                    className="h-6 w-6 rounded bg-coffee-100 text-coffee-700 hover:bg-coffee-200"
                  >
                    +
                  </button>
                </div>
                <div className="w-16 text-right text-sm font-medium text-coffee-800">
                  {formatMoney(item.price * item.qty)}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Customer + payment */}
        <div className="space-y-3 border-t border-coffee-100 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-coffee-500">
              Customer (optional)
            </label>
            <select
              className="input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-coffee-500">
                Payment
              </label>
              <select
                className="input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-coffee-500">
                Discount (฿)
              </label>
              <input
                type="number"
                min={0}
                className="input"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 space-y-1 border-t border-coffee-100 pt-4 text-sm">
          <div className="flex justify-between text-coffee-600">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {clampedDiscount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discount</span>
              <span>−{formatMoney(clampedDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between text-coffee-600">
            <span>VAT (7%)</span>
            <span>{formatMoney(tax)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-coffee-900">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>

        {message && (
          <p
            className={
              "mt-3 rounded-lg px-3 py-2 text-sm " +
              (message.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700")
            }
          >
            {message.text}
          </p>
        )}

        <button
          onClick={checkout}
          disabled={!lines.length || submitting}
          className="btn-primary mt-4 w-full"
        >
          {submitting ? "Processing…" : `Charge ${formatMoney(total)}`}
        </button>
      </div>
    </div>
  );
}
