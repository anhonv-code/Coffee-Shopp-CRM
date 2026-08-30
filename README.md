# ☕ Coffee Shopp CRM

A management platform for a coffee shop / multi-branch coffee business: **POS,
inventory control, recipes (BOM), CRM, promotions, RBAC, and a P&L dashboard** —
built as a single Next.js app.

This repository is the **runnable MVP foundation** derived from the original
architecture/requirements design. It replaces "design docs only" with a working,
type-safe application you can run today and grow into the full system.

---

## ✨ What works today (MVP milestone 1)

| Module | Status | Notes |
| --- | --- | --- |
| **Auth + sessions** | ✅ | Email/password, signed-JWT cookie, route middleware |
| **RBAC + branch scoping** | ✅ | `SUPER_ADMIN`, `BRANCH_MANAGER`, `BARISTA`, `CASHIER`; every query scoped to the user's branch |
| **POS** | ✅ | Product grid → cart → charge; VAT + discount; live totals |
| **Critical path** (POS → stock → P&L) | ✅ | Selling deducts ingredient stock from the recipe, writes the ledger, and snapshots COGS — **all in one transaction** |
| **Oversell protection** | ✅ | Atomic guarded stock deduction; a short ingredient rolls the whole sale back (HTTP 409) |
| **Inventory** | ✅ | Stock on hand, stock value, low-stock flags, movement ledger |
| **Products & Recipes** | ✅ | Variants, recipe (BOM), auto cost + margin per drink |
| **Promotions engine** | ✅ | Codes + auto-promos applied at checkout (windows, min order, discount cap, redemption limit), redemptions tracked — all inside the sale transaction |
| **Purchasing / receiving** | ✅ | Create purchase orders and receive stock; receiving adds stock, writes the ledger, and updates each ingredient's moving-average cost — completing the inventory loop |
| **Online ordering** | ✅ | Public storefront at `/order` (no login): browse the menu, order for pickup, reserves stock — lands in the kitchen queue as `pending`, pay on pickup |
| **Kitchen display** | ✅ | Live board of active orders with a `pending → confirmed → preparing → ready → completed` state machine; payment settles on completion; auto-refreshes |
| **Orders** | ✅ | Recent order history across channels |
| **Dashboard** | ✅ | Today + 14-day revenue/COGS/margin, top products, payment mix, low stock |

### Designed, not yet built (next milestones)

Delivery dispatch/tracking, Socket.IO realtime (the kitchen display currently
polls), staff scheduling, demand forecasting, and the **offline-sync layer**
(the topic the original design explored in depth). The schema already includes
the tables these need.

**Demo promo codes** (Siam branch): `WELCOME50` (฿50 off, min ฿100), `MORNING10`
(10% off, 07:00–10:00), plus an auto-applied *Weekend 15% Off* (no code, weekends,
min ฿150).

---

## 🧱 Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** for styling
- **Prisma** ORM
- **SQLite** in development (zero-config) → **PostgreSQL** in production
- **jose** (JWT sessions) + **bcryptjs** (password hashing)
- **Recharts** for dashboard charts · **Zod** for API validation

> The original design targeted a Next.js + NestJS + Redis + Socket.IO + BullMQ
> stack. This MVP is a **pragmatic monolith** — one codebase, one language — that
> covers every core requirement first. The heavier infrastructure can be layered
> on where load demands it, without changing the data model.

---

## 🚀 Getting started

```bash
# 1. Install
npm install

# 2. Configure env (defaults work out of the box for dev)
cp .env.example .env

# 3. Create the SQLite DB, generate the client, and seed demo data
npm run setup

# 4. Run
npm run dev
# open http://localhost:3000
```

### Demo accounts (password: `password123`)

| Email | Role | Scope |
| --- | --- | --- |
| `admin@coffeeshopp.com` | Super Admin | All branches |
| `manager@coffeeshopp.com` | Branch Manager | Siam branch |
| `barista@coffeeshopp.com` | Barista | Siam branch (POS) |

The seed creates 2 branches, a full coffee menu with recipes, suppliers,
customers, a promotion, and ~2 weeks of historical orders so the dashboard has
data on first load.

---

## 📜 Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run setup` | Generate client + push schema + seed (first-time setup) |
| `npm run db:seed` | Re-seed demo data |
| `npm run db:reset` | Wipe and re-seed the database |
| `npm run db:migrate` | Create a migration (for real deployments) |
| `npm test` | Run the integration test suite (against a throwaway SQLite DB) |
| `npm run lint` | ESLint |

## ✅ Tests & CI

Integration tests in [`tests/`](./tests) exercise the three critical business
paths directly against a throwaway SQLite database (no server needed):

- **POS sale** — stock deduction from the recipe, ledger rows, COGS, and the
  oversell rollback.
- **Promotions** — code validation, minimum-order rejection, discount applied
  in a sale, and redemption tracking.
- **Purchasing** — receiving adds stock, blends the moving-average cost, writes
  the ledger, and rejects double-receiving.
- **Fulfillment** — an online order starts pending/unpaid but reserves stock,
  advances through the kitchen state machine, and settles payment on completion;
  illegal transitions are rejected.

```bash
npm test
```

GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs
`npm test` and `npm run build` on every push and pull request.

---

## 🗄️ Data model (highlights)

The **recipe is the connective tissue** — one `Recipe` (bill of materials) per
product variant drives three requirements at once:

1. **Stock control** — selling a Latte decrements beans, milk, and a cup.
2. **P&L** — the recipe's cost *is* the COGS, so margin per drink is automatic.
3. **Forecasting** (future) — demand for "Latte" becomes demand for beans.

The **stock ledger** (`StockMovement`) is append-only: every purchase, sale,
waste, or adjustment is one immutable row. `Ingredient.currentStock` is a
denormalized cache kept in sync inside the sale transaction.

See [`prisma/schema.prisma`](./prisma/schema.prisma) for the full schema (~22
models) and [`src/lib/pos.ts`](./src/lib/pos.ts) for the transactional sale path.

---

## 🐘 Moving to PostgreSQL

1. In `prisma/schema.prisma`, change the datasource `provider` to `"postgresql"`.
2. Point `DATABASE_URL` at your Postgres instance.
3. `npx prisma migrate deploy` (or `db push`), then `npm run db:seed`.

The schema was written to be portable: money and quantities use `Decimal`,
status/type columns are strings with their allowed values documented inline (and
enforced in `src/lib/constants.ts`), and array-shaped columns use `Json`.

---

## 📁 Project structure

```
prisma/
  schema.prisma      # data model (SQLite dev / Postgres prod)
  seed.ts            # demo data + historical orders
src/
  app/
    login/           # auth screen (server action)
    (app)/           # authenticated shell: dashboard, pos, orders, inventory, products
    api/pos/sell/    # transactional sale endpoint
  lib/
    pos.ts           # the critical path: sellOrder() (atomic stock + COGS)
    analytics.ts     # dashboard aggregation (P&L, top products, low stock)
    auth.ts          # sessions (JWT cookie)
    rbac.ts          # roles, permissions, branch scoping
    catalog.ts       # menu loading
    prisma.ts        # Prisma client singleton
  middleware.ts      # auth gate
```
