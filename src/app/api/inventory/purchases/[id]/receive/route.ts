import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/rbac";
import { receivePurchase, PurchaseError } from "@/lib/purchasing";

const bodySchema = z.object({
  branchId: z.string().optional(),
  // Omit `lines` to receive all outstanding quantities in full.
  lines: z
    .array(z.object({ itemId: z.string(), quantity: z.number().positive() }))
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "inventory:manage"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const branchId = isSuperAdmin(user.role)
    ? (parsed.data.branchId ?? user.branchId)
    : user.branchId;
  if (!branchId)
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });

  try {
    const po = await receivePurchase({
      purchaseId: id,
      branchId,
      userId: user.id,
      lines: parsed.data.lines,
    });
    return NextResponse.json({ ok: true, status: po.status });
  } catch (err) {
    if (err instanceof PurchaseError)
      return NextResponse.json({ error: "purchase", message: err.message }, { status: 400 });
    console.error("receivePurchase failed:", err);
    return NextResponse.json({ error: "Failed to receive purchase" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
