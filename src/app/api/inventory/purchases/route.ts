import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/rbac";
import { createPurchaseOrder, PurchaseError } from "@/lib/purchasing";

const bodySchema = z.object({
  branchId: z.string().optional(),
  supplierId: z.string(),
  expectedDate: z.string().nullish(),
  notes: z.string().nullish(),
  lines: z
    .array(
      z.object({
        ingredientId: z.string(),
        quantityOrdered: z.number().positive(),
        unitCost: z.number().min(0),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "inventory:manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );

  const branchId = isSuperAdmin(user.role)
    ? (parsed.data.branchId ?? user.branchId)
    : user.branchId;
  if (!branchId)
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });

  try {
    const po = await createPurchaseOrder({
      branchId,
      userId: user.id,
      supplierId: parsed.data.supplierId,
      lines: parsed.data.lines,
      expectedDate: parsed.data.expectedDate ?? null,
      notes: parsed.data.notes ?? null,
    });
    return NextResponse.json({ ok: true, id: po.id, poNumber: po.poNumber });
  } catch (err) {
    if (err instanceof PurchaseError)
      return NextResponse.json({ error: "purchase", message: err.message }, { status: 400 });
    console.error("createPurchaseOrder failed:", err);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
