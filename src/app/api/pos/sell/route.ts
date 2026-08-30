import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/rbac";
import { sellOrder, InsufficientStockError } from "@/lib/pos";
import { PAYMENT_METHODS } from "@/lib/constants";

const bodySchema = z.object({
  branchId: z.string().optional(),
  posSessionId: z.string().nullish(),
  customerId: z.string().nullish(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(1).optional(),
  orderType: z.string().optional(),
  customerNotes: z.string().optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string(),
        quantity: z.number().int().min(1),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(user.role, "pos:operate")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Branch scoping: non-super-admins can only sell in their own branch.
  const branchId = isSuperAdmin(user.role)
    ? (body.branchId ?? user.branchId)
    : user.branchId;
  if (!branchId) {
    return NextResponse.json(
      { error: "No branch selected for this sale" },
      { status: 400 },
    );
  }

  try {
    const order = await sellOrder({
      branchId,
      userId: user.id,
      posSessionId: body.posSessionId ?? null,
      customerId: body.customerId ?? null,
      lines: body.lines,
      paymentMethod: body.paymentMethod,
      discountAmount: body.discountAmount ?? 0,
      taxRate: body.taxRate ?? 0,
      orderType: body.orderType ?? "dine_in",
      customerNotes: body.customerNotes,
    });

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          error: "insufficient_stock",
          message: err.message,
          ingredient: err.ingredientName,
          available: err.available,
          required: err.required,
        },
        { status: 409 },
      );
    }
    console.error("sellOrder failed:", err);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
