import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber, round } from "./decimal";

// Promo types this engine can price today. Others (bogo, buy_x_get_y,
// free_item, loyalty_reward) are recognised but priced as 0 until their
// item-level rules are built.
const PRICEABLE = new Set(["percentage_off", "fixed_off"]);

export interface PromoResult {
  promotionId: string;
  name: string;
  code: string | null;
  discountAmount: number;
}

export interface PromoRejection {
  error: string;
}

type Client = Prisma.TransactionClient | typeof prisma;

function currentHHMM(now: Date): string {
  // Compare against Asia/Bangkok wall-clock so time-windowed promos line up
  // with the shop's local hours regardless of server timezone.
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(now);
}

function bangkokDayOfWeek(now: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Bangkok",
  }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

type PromoRow = Awaited<ReturnType<typeof prisma.promotion.findFirst>>;

/** Is this promo live right now for this branch, given the order subtotal? */
function windowOk(
  promo: NonNullable<PromoRow>,
  branchId: string,
  subtotal: number,
  now: Date,
): string | null {
  if (!promo.isActive) return "This promotion is not active.";
  if (promo.branchId && promo.branchId !== branchId)
    return "This promotion is not valid at this branch.";
  if (now < promo.startDate) return "This promotion has not started yet.";
  if (now > promo.endDate) return "This promotion has expired.";
  if (subtotal < toNumber(promo.minOrderValue))
    return `Minimum order of ฿${toNumber(promo.minOrderValue)} required.`;
  if (
    promo.maxRedemptions != null &&
    promo.timesRedeemed >= promo.maxRedemptions
  )
    return "This promotion has reached its redemption limit.";

  const days = promo.daysOfWeek as number[] | null;
  if (days && days.length > 0 && !days.includes(bangkokDayOfWeek(now)))
    return "This promotion is not available today.";

  if (promo.timeStart && promo.timeEnd) {
    const nowHHMM = currentHHMM(now);
    if (nowHHMM < promo.timeStart || nowHHMM > promo.timeEnd)
      return `This promotion is only valid between ${promo.timeStart} and ${promo.timeEnd}.`;
  }
  return null;
}

function computeDiscount(
  promo: NonNullable<PromoRow>,
  subtotal: number,
): number {
  if (!PRICEABLE.has(promo.promoType)) return 0;
  let discount = 0;
  if (promo.promoType === "percentage_off") {
    discount = subtotal * (toNumber(promo.discountValue) / 100);
  } else if (promo.promoType === "fixed_off") {
    discount = toNumber(promo.discountValue);
  }
  const cap = promo.maxDiscount != null ? toNumber(promo.maxDiscount) : null;
  if (cap != null) discount = Math.min(discount, cap);
  return round(Math.min(discount, subtotal));
}

/**
 * Resolve the promotion to apply to an order.
 * - If `code` is given, match that code and return an error string if it's
 *   invalid/expired/etc. (so the cashier sees why).
 * - If no code, auto-apply the best-value code-less promotion, if any.
 * Returns null when nothing applies (and no code was entered).
 */
export async function resolvePromotion(
  client: Client,
  opts: { branchId: string; code?: string | null; subtotal: number; now?: Date },
): Promise<PromoResult | PromoRejection | null> {
  const now = opts.now ?? new Date();
  const code = opts.code?.trim();

  if (code) {
    const promo = await client.promotion.findFirst({
      where: {
        code: { equals: code },
        OR: [{ branchId: opts.branchId }, { branchId: null }],
      },
    });
    if (!promo) return { error: "Promo code not found." };
    const reason = windowOk(promo, opts.branchId, opts.subtotal, now);
    if (reason) return { error: reason };
    const discountAmount = computeDiscount(promo, opts.subtotal);
    if (discountAmount <= 0)
      return { error: "This promotion type isn't supported at checkout yet." };
    return { promotionId: promo.id, name: promo.name, code: promo.code, discountAmount };
  }

  // Auto-promotions: code-less, currently live.
  const autos = await client.promotion.findMany({
    where: {
      code: null,
      isActive: true,
      OR: [{ branchId: opts.branchId }, { branchId: null }],
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
  let best: PromoResult | null = null;
  for (const promo of autos) {
    if (windowOk(promo, opts.branchId, opts.subtotal, now)) continue;
    const discountAmount = computeDiscount(promo, opts.subtotal);
    if (discountAmount > 0 && (!best || discountAmount > best.discountAmount)) {
      best = {
        promotionId: promo.id,
        name: promo.name,
        code: promo.code,
        discountAmount,
      };
    }
  }
  return best;
}

export function isRejection(
  r: PromoResult | PromoRejection | null,
): r is PromoRejection {
  return r != null && "error" in r;
}
