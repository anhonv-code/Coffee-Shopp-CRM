import { Prisma } from "@prisma/client";

/** Convert a Prisma Decimal (or number/string) to a plain JS number. */
export function toNumber(
  value: Prisma.Decimal | number | string | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  return value.toNumber();
}

/** Round to `dp` decimal places using standard half-up rounding. */
export function round(value: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round((value + Number.EPSILON) * f) / f;
}
