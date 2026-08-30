import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/rbac";
import { advanceOrderStatus, StatusError } from "@/lib/fulfillment";
import { ORDER_STATUS } from "@/lib/constants";

const bodySchema = z.object({
  branchId: z.string().optional(),
  status: z.enum([
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.READY,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ]),
  cancelReason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "orders:manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const branchId = isSuperAdmin(user.role)
    ? (parsed.data.branchId ?? user.branchId)
    : user.branchId;
  if (!branchId)
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });

  try {
    const order = await advanceOrderStatus({
      orderId: id,
      branchId,
      userId: user.id,
      newStatus: parsed.data.status,
      cancelReason: parsed.data.cancelReason,
    });
    return NextResponse.json({ ok: true, status: order.status });
  } catch (err) {
    if (err instanceof StatusError)
      return NextResponse.json({ error: "status", message: err.message }, { status: 409 });
    console.error("advanceOrderStatus failed:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
