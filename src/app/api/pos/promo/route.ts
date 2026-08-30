import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { resolvePromotion, isRejection } from "@/lib/promotions";

const bodySchema = z.object({
  branchId: z.string().optional(),
  code: z.string().max(100).nullish(),
  subtotal: z.number().min(0),
});

/** Preview the discount a promo code (or the best auto-promo) would give. */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user.role, "pos:operate"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const branchId = isSuperAdmin(user.role)
    ? (parsed.data.branchId ?? user.branchId)
    : user.branchId;
  if (!branchId)
    return NextResponse.json({ error: "No branch selected" }, { status: 400 });

  const result = await resolvePromotion(prisma, {
    branchId,
    code: parsed.data.code,
    subtotal: parsed.data.subtotal,
  });

  if (isRejection(result)) {
    return NextResponse.json({ ok: false, message: result.error });
  }
  if (!result) {
    return NextResponse.json({ ok: false, message: "No promotion applies." });
  }
  return NextResponse.json({ ok: true, promo: result });
}

export const dynamic = "force-dynamic";
