"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui";

interface Supplier {
  id: string;
  name: string;
}
interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}
interface POItem {
  id: string;
  name: string;
  unit: string;
  ordered: number;
  received: number;
  unitCost: number;
}
interface PO {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  totalCost: number;
  orderDate: string;
  items: POItem[];
}
interface Line {
  ingredientId: string;
  quantity: string;
  unitCost: string;
}

const STATUS_COLOR: Record<string, "green" | "amber" | "blue" | "gray" | "red"> = {
  received: "green",
  partial: "amber",
  ordered: "blue",
  draft: "gray",
  cancelled: "red",
};

export function PurchasingClient({
  branchId,
  purchases,
  suppliers,
  ingredients,
}: {
  branchId: string;
  purchases: PO[];
  suppliers: Supplier[];
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([
    { ingredientId: ingredients[0]?.id ?? "", quantity: "", unitCost: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [
      ...prev,
      { ingredientId: ingredients[0]?.id ?? "", quantity: "", unitCost: "" },
    ]);
  }
  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const formTotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );

  async function createPO() {
    const payload = {
      branchId,
      supplierId,
      lines: lines
        .filter((l) => l.ingredientId && Number(l.quantity) > 0)
        .map((l) => ({
          ingredientId: l.ingredientId,
          quantityOrdered: Number(l.quantity),
          unitCost: Number(l.unitCost) || 0,
        })),
    };
    if (!payload.supplierId || payload.lines.length === 0) {
      setMsg({ type: "error", text: "Pick a supplier and at least one item with a quantity." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/inventory/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.message ?? "Could not create the PO." });
        return;
      }
      setMsg({ type: "success", text: `Created ${data.poNumber}.` });
      setShowForm(false);
      setLines([{ ingredientId: ingredients[0]?.id ?? "", quantity: "", unitCost: "" }]);
      router.refresh();
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  async function receive(po: PO) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/inventory/purchases/${po.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.message ?? "Could not receive stock." });
        return;
      }
      setMsg({ type: "success", text: `${po.poNumber} received — stock updated.` });
      router.refresh();
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-coffee-500">
          Receiving a PO adds stock and updates each ingredient&apos;s
          moving-average cost.
        </p>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New purchase order"}
        </button>
      </div>

      {msg && (
        <p
          className={
            "rounded-lg px-3 py-2 text-sm " +
            (msg.type === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700")
          }
        >
          {msg.text}
        </p>
      )}

      {/* New PO form */}
      {showForm && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-coffee-800">New purchase order</h2>
          <div className="mb-4 max-w-xs">
            <label className="mb-1 block text-xs font-medium text-coffee-500">
              Supplier
            </label>
            <select
              className="input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label className="mb-1 block text-xs text-coffee-400">Ingredient</label>
                  <select
                    className="input"
                    value={line.ingredientId}
                    onChange={(e) => {
                      const ing = ingredients.find((i) => i.id === e.target.value);
                      updateLine(idx, {
                        ingredientId: e.target.value,
                        unitCost: line.unitCost || String(ing?.unitCost ?? ""),
                      });
                    }}
                  >
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-coffee-400">Quantity</label>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs text-coffee-400">Unit cost</label>
                  <input
                    type="number"
                    min={0}
                    step="0.0001"
                    className="input"
                    value={line.unitCost}
                    onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                  />
                </div>
                <button
                  onClick={() => removeLine(idx)}
                  disabled={lines.length === 1}
                  className="btn-ghost h-[38px]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button className="btn-ghost" onClick={addLine}>
              + Add item
            </button>
            <div className="text-sm text-coffee-600">
              Order total:{" "}
              <b className="text-coffee-800">{formatMoney(formTotal)}</b>
            </div>
          </div>

          <button className="btn-primary mt-4" onClick={createPO} disabled={busy}>
            {busy ? "Saving…" : "Create purchase order"}
          </button>
        </div>
      )}

      {/* PO list */}
      {purchases.length === 0 ? (
        <div className="card p-8 text-center text-sm text-coffee-400">
          No purchase orders yet.
        </div>
      ) : (
        <div className="space-y-3">
          {purchases.map((po) => {
            const canReceive = po.status !== "received" && po.status !== "cancelled";
            return (
              <div key={po.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-coffee-800">{po.poNumber}</span>
                    <span className="ml-2 text-sm text-coffee-500">{po.supplier}</span>
                    <span className="ml-2 text-xs text-coffee-400">
                      {formatDate(po.orderDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-coffee-800">
                      {formatMoney(po.totalCost)}
                    </span>
                    <Badge color={STATUS_COLOR[po.status] ?? "gray"}>
                      {po.status}
                    </Badge>
                    {canReceive && (
                      <button
                        className="btn-primary"
                        onClick={() => receive(po)}
                        disabled={busy}
                      >
                        Receive
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {po.items.map((it) => (
                    <span
                      key={it.id}
                      className="rounded bg-coffee-50 px-2 py-0.5 text-xs text-coffee-600"
                    >
                      {it.name}: {formatNumber(it.received, 2)}/
                      {formatNumber(it.ordered, 2)} {it.unit}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
