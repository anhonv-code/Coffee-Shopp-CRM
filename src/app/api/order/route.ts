import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sellOrder, InsufficientStockError, PromoError } from "@/lib/pos";

// Public, unauthenticated endpoint for the customer-facing ordering site.
const bodySchema = z.object({
  branchId: z.string(),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().max(40).optional(),
  orderType: z.enum(["takeaway", "delivery"]).default("takeaway"),
  notes: z.string().max(500).optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string(),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1),
});

const TAX_RATE = 0.07;

/** Resolve the user that online orders are attributed to. */
async function systemUserId(branchId: string): Promise<string | null> {
  const sys = await prisma.user.findFirst({
    where: { email: "system@coffeeshopp.com" },
    select: { id: true },
  });
  if (sys) return sys.id;
  // Fall back to any active user tied to the branch.
  const fallback = await prisma.user.findFirst({
    where: { OR: [{ branchId }, { branchId: null }], isActive: true },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  const body = parsed.data;

  const branch = await prisma.branch.findFirst({
    where: { id: body.branchId, isActive: true },
  });
  if (!branch)
    return NextResponse.json({ error: "Unknown branch" }, { status: 400 });

  const userId = await systemUserId(branch.id);
  if (!userId)
    return NextResponse.json(
      { error: "Ordering is temporarily unavailable" },
      { status: 503 },
    );

  // Capture the customer in the CRM (match on phone within the branch).
  let customerId: string | null = null;
  if (body.customerPhone) {
    const existing = await prisma.customer.findFirst({
      where: { branchId: branch.id, phone: body.customerPhone },
    });
    customerId = existing
      ? existing.id
      : (
          await prisma.customer.create({
            data: { branchId: branch.id, name: body.customerName, phone: body.customerPhone },
          })
        ).id;
  }

  try {
    const { order } = await sellOrder({
      branchId: branch.id,
      userId,
      customerId,
      source: "online",
      orderType: body.orderType,
      status: "pending", // enters the kitchen queue
      markPaid: false, // pay on pickup/delivery
      taxRate: TAX_RATE,
      customerNotes: [body.customerName, body.notes].filter(Boolean).join(" — "),
      lines: body.lines,
      paymentMethod: "cash",
    });
    return NextResponse.json({
      ok: true,
      orderNumber: order.orderNumber,
      total: order.total,
    });
  } catch (err) {
    if (err instanceof InsufficientStockError)
      return NextResponse.json(
        { error: "insufficient_stock", message: err.message },
        { status: 409 },
      );
    if (err instanceof PromoError)
      return NextResponse.json({ error: "promo", message: err.message }, { status: 409 });
    console.error("online order failed:", err);
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
