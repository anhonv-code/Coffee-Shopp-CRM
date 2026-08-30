// Canonical value lists shared by the schema (documented inline there), the
// Zod validators, and the UI. Keeping them here means one source of truth even
// though the DB columns are plain strings for SQLite/Postgres portability.

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  BARISTA: "BARISTA",
  CASHIER: "CASHIER",
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_LIST = Object.values(ROLES);

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  BRANCH_MANAGER: "Branch Manager",
  BARISTA: "Barista",
  CASHIER: "Cashier",
};

export const ORDER_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  PREPARING: "preparing",
  READY: "ready",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded",
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_SOURCES = ["pos", "online", "delivery", "phone", "app"] as const;
export const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "preorder"] as const;

export const PAYMENT_METHODS = [
  "cash",
  "credit_card",
  "debit_card",
  "mobile",
  "promptpay",
  "line_pay",
  "stripe",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  mobile: "Mobile",
  promptpay: "PromptPay",
  line_pay: "LINE Pay",
  stripe: "Stripe",
  other: "Other",
};

export const MOVEMENT_TYPES = [
  "purchase",
  "sale",
  "waste",
  "adjustment",
  "transfer_in",
  "transfer_out",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const UNITS = ["g", "kg", "ml", "L", "pcs"] as const;
export type Unit = (typeof UNITS)[number];
