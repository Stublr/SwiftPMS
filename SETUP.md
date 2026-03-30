# SmartPOS — Development Setup Guide

This document walks you through getting the full SmartPOS stack running locally.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| **Node.js** | >= 22.0.0 | `node -v` |
| **pnpm** | >= 9.0.0 | `pnpm -v` |
| **Docker Desktop** | Latest | `docker -v` |
| **Git** | Latest | `git -v` |

> If you don't have pnpm: `npm install -g pnpm@9`

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  POS (React) │────▶│  API (Fastify)│────▶│  PostgreSQL  │
│  :5173       │     │  :3000       │     │  :5432       │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┼──────┐
                    │      │      │
               ┌────▼──┐ ┌▼────┐ ┌▼────┐
               │ Redis  │ │MinIO│ │Socket│
               │ :6379  │ │:9000│ │ /ws  │
               └────────┘ └─────┘ └──────┘
```

| Service | Purpose | Port(s) |
|---------|---------|---------|
| **PostgreSQL 16** | Primary database (Drizzle ORM, RLS) | 5432 |
| **Redis 7** | Caching (cache-aside pattern) | 6379 |
| **MinIO** | S3-compatible file storage (product images) | 9000 (API), 9001 (console) |
| **Fastify API** | REST API + Socket.IO | 3000 |
| **React POS** | PWA frontend (Vite dev server) | 5173 |

---

## Step-by-Step Setup

### 1. Clone & Install Dependencies

```bash
cd SmartPOS
pnpm install
```

This installs all workspace dependencies across `apps/api`, `apps/pos`, `packages/shared`, `packages/db`, etc.

---

### 2. Start Infrastructure (Docker)

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts three containers:

| Container | Image | What it does |
|-----------|-------|-------------|
| `postgres` | `postgres:16-alpine` | Database with `uuid-ossp` and `pgcrypto` extensions enabled |
| `redis` | `redis:7-alpine` | Cache store |
| `minio` | `minio/minio:latest` | S3-compatible object storage |

**Verify they're running:**

```bash
docker compose -f docker/docker-compose.yml ps
```

All three should show "healthy" or "running".

**Default credentials (set in docker-compose.yml):**

| Service | User | Password |
|---------|------|----------|
| PostgreSQL | `smartpos` | `smartpos_dev` |
| MinIO | `minioadmin` | `minioadmin` |
| Redis | _(no auth)_ | — |

The PostgreSQL container automatically runs `docker/postgres/init.sql` on first boot, which:
- Enables `uuid-ossp` and `pgcrypto` extensions
- Creates the `smartpos_app` role (used for RLS enforcement)

---

### 3. Create Environment Files

**API** — copy the example and adjust if needed:

```bash
cp apps/api/.env.example apps/api/.env
```

Contents of `apps/api/.env`:

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://smartpos:smartpos_dev@localhost:5432/smartpos_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT — change these to random strings (min 32 chars each)
JWT_ACCESS_SECRET=change-me-dev-access-secret-min-32-chars
JWT_REFRESH_SECRET=change-me-dev-refresh-secret-min-32-chars

# CORS
CORS_ORIGIN=http://localhost:5173

# S3 / MinIO (used for product image uploads)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=smartpos

# Logging
LOG_LEVEL=debug
```

**POS** — copy the example:

```bash
cp apps/pos/.env.example apps/pos/.env
```

Contents of `apps/pos/.env`:

```env
VITE_API_URL=http://localhost:3000/v1
```

> The POS dev server also proxies `/api` requests to `localhost:3000` via Vite's proxy config — but the app uses `VITE_API_URL` directly for API calls.

---

### 4. Build Shared Packages

The API and POS apps depend on `@smartpos/shared` and `@smartpos/db`. These must be built first:

```bash
pnpm build --filter="./packages/*"
```

This compiles:
- `packages/shared` — Zod schemas, types, utility functions
- `packages/db` — Drizzle schema definitions, migration runner, seed script

---

### 5. Generate Database Migrations

The Drizzle schema is defined in TypeScript (`packages/db/src/schema/*.ts`) but no SQL migration files exist yet. You need to generate them:

```bash
cd packages/db
DATABASE_URL=postgresql://smartpos:smartpos_dev@localhost:5432/smartpos_dev pnpm db:generate
```

This reads all schema files and outputs SQL migration files to `packages/db/src/migrations/`.

> **What the schema includes:** tenants, branches, users, user_branches, categories, tax_rates, products, product_variants, registers, transactions, transaction_items, payments, stock_levels, stock_movements, customers, audit_log, suppliers, purchase_orders, purchase_order_items, stock_counts, stock_count_items, stock_transfers, promotions, held_carts, held_cart_items, cash_drops, integrations, api_keys, device_tokens, notifications

---

### 6. Run Migrations

Apply the generated SQL to the database:

```bash
DATABASE_URL=postgresql://smartpos:smartpos_dev@localhost:5432/smartpos_dev pnpm db:migrate
```

Or from the project root:

```bash
pnpm db:migrate
```

> **Note:** The `DATABASE_URL` is read from `apps/api/.env` when run via the root script, or must be passed explicitly when running directly in `packages/db`.

**Verify tables were created:**

```bash
docker compose -f docker/docker-compose.yml exec postgres psql -U smartpos -d smartpos_dev -c "\dt"
```

You should see 30+ tables listed.

---

### 7. Seed the Database

Populate the database with demo data:

```bash
DATABASE_URL=postgresql://smartpos:smartpos_dev@localhost:5432/smartpos_dev pnpm db:seed
```

**What gets created:**

| Entity | Details |
|--------|---------|
| **Tenant** | "Demo Store" |
| **Branches** | "Main Street", "Mall Branch" |
| **Tax Rate** | VAT 15% (default) |
| **Registers** | 2 at Main Street, 1 at Mall Branch |
| **Users** | See table below |
| **Categories** | Electronics, Groceries, Clothing |
| **Products** | 10 products across categories |
| **Stock Levels** | Random quantities per product per branch |
| **Customers** | 3 demo customers with loyalty points |

**Demo Users:**

| Email | Password | PIN | Role |
|-------|----------|-----|------|
| `admin@demo.com` | `password123` | `1234` | Super Admin |
| `manager@demo.com` | `password123` | `1234` | Branch Manager |
| `cashier@demo.com` | `password123` | `1234` | Cashier |
| `stockist@demo.com` | `password123` | — | Stockist |
| `auditor@demo.com` | `password123` | — | Auditor |

---

### 8. Set Up MinIO Bucket (Optional — for image uploads)

MinIO needs a bucket created for product image storage. Open the MinIO console:

1. Go to **http://localhost:9001**
2. Log in with `minioadmin` / `minioadmin`
3. Create a bucket named `smartpos` (or whatever `S3_BUCKET` is set to)
4. Set the bucket's access policy to **public** if you want images accessible without signed URLs

Alternatively via CLI:

```bash
docker compose -f docker/docker-compose.yml exec minio mc alias set local http://localhost:9000 minioadmin minioadmin
docker compose -f docker/docker-compose.yml exec minio mc mb local/smartpos
docker compose -f docker/docker-compose.yml exec minio mc anonymous set download local/smartpos
```

> Image uploads are only needed if you use the `POST /v1/products/:id/image` endpoint. The app works fine without MinIO for all other features.

---

### 9. Start Development Servers

From the project root:

```bash
pnpm dev
```

This starts both servers via Turborepo:

| Server | URL | What to expect |
|--------|-----|----------------|
| **API** | http://localhost:3000 | `{"status":"ok","timestamp":"..."}` at `/health` |
| **POS** | http://localhost:5173 | Login page |
| **Swagger Docs** | http://localhost:3000/docs | OpenAPI documentation |
| **Socket.IO** | ws://localhost:3000/ws | WebSocket (used internally by POS) |

Or start them individually:

```bash
# API only
pnpm --filter @smartpos/api dev

# POS only
pnpm --filter @smartpos/pos dev
```

---

## Verify Everything Works

### Quick Health Check

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"2026-02-17T..."}
```

### Login via API

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}'
```

You should get back `accessToken`, `refreshToken`, and user info.

### Open the POS

1. Go to http://localhost:5173
2. Log in with `admin@demo.com` / `password123`
3. Select "Main Street" branch
4. Select "Register 1"
5. Open the register (enter any starting cash amount)
6. You should see the POS interface with products

---

## Data Flow Summary

```
User opens POS (localhost:5173)
  │
  ├─ Login ──▶ POST /v1/auth/login ──▶ Returns JWT tokens
  │             (stored in Zustand + localStorage)
  │
  ├─ Select Branch ──▶ GET /v1/branches ──▶ User's assigned branches
  │
  ├─ Select Register ──▶ GET /v1/registers?branchId=... ──▶ Available registers
  │
  ├─ Open Register ──▶ POST /v1/registers/:id/open ──▶ Creates shift session
  │
  ├─ Load Products ──▶ GET /v1/products ──▶ Products + stock levels
  │   (also cached in IndexedDB via Dexie.js for offline use)
  │
  ├─ Add to Cart ──▶ Local state (Zustand cart store)
  │
  ├─ Checkout ──▶ POST /v1/transactions ──▶ Atomic: create transaction,
  │               deduct stock, record payments, apply promotions
  │               ──▶ Socket.IO emits "transaction:created" to branch room
  │
  ├─ Void Sale ──▶ POST /v1/transactions/:id/void ──▶ Restores stock,
  │               logs audit entry, emits "transaction:voided"
  │
  ├─ Close Register ──▶ POST /v1/registers/:id/close ──▶ Ends shift,
  │               records counted cash, calculates discrepancy
  │
  └─ Reports/Admin ──▶ GET /v1/reports/* ──▶ Sales, products, cashiers,
                        payments, dashboard summary
```

**Tenant Isolation:** Every authenticated request sets a PostgreSQL session variable (`app.current_tenant_id`) via the `tenant-context` plugin. Row-Level Security (RLS) policies on all tables filter data to the current tenant automatically.

**Offline Mode:** The POS is a PWA. When offline, products and customers are served from IndexedDB (Dexie.js). Sales are queued in a sync queue and submitted when connectivity returns.

---

## Common Commands Reference

| Command | What it does |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build entire monorepo |
| `pnpm dev` | Start API + POS dev servers |
| `pnpm test` | Run all unit tests (157 tests) |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm lint` | Lint all packages |
| `pnpm type-check` | TypeScript check all packages |
| `pnpm db:generate` | Generate Drizzle migration SQL from schema |
| `pnpm db:migrate` | Apply migrations to database |
| `pnpm db:seed` | Seed database with demo data |
| `docker compose -f docker/docker-compose.yml up -d` | Start infra |
| `docker compose -f docker/docker-compose.yml down` | Stop infra |
| `docker compose -f docker/docker-compose.yml down -v` | Stop infra + delete data |

---

## Resetting the Database

If you need a clean slate:

```bash
# Drop and recreate the database
docker compose -f docker/docker-compose.yml exec postgres psql -U smartpos -c "DROP DATABASE IF EXISTS smartpos_dev;"
docker compose -f docker/docker-compose.yml exec postgres psql -U smartpos -c "CREATE DATABASE smartpos_dev;"
docker compose -f docker/docker-compose.yml exec postgres psql -U smartpos -d smartpos_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"

# Re-run migrations and seed
pnpm db:migrate
pnpm db:seed
```

Or use the provided script: `bash scripts/reset-db.sh`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `DATABASE_URL` validation fails | Make sure `apps/api/.env` exists and has the correct connection string |
| Docker containers won't start | Check if ports 5432, 6379, 9000 are already in use |
| Migrations fail | Ensure PostgreSQL is running: `docker compose -f docker/docker-compose.yml ps` |
| `pnpm build` fails | Run `pnpm install` first, then `pnpm build --filter="./packages/*"` before building apps |
| POS shows blank page | Check browser console; ensure `VITE_API_URL` is set in `apps/pos/.env` |
| API returns 401 on everything | JWT secrets must be at least 32 characters long |
| MinIO upload fails | Create the `smartpos` bucket first (see Step 8) |
| Socket.IO not connecting | The API must be running; Socket.IO is on the same port (3000) at path `/ws` |

---

## Project Structure

```
SmartPOS/
├── apps/
│   ├── api/                    # Fastify REST API
│   │   ├── src/
│   │   │   ├── config/env.ts   # Environment validation (Zod)
│   │   │   ├── lib/            # db.ts, redis.ts, cache.ts, storage.ts, socket.ts, audit.ts
│   │   │   ├── modules/        # Vertical slices (20+ feature modules)
│   │   │   │   ├── auth/       #   routes.ts, service.ts, repository.ts
│   │   │   │   ├── products/   #   routes.ts, service.ts, repository.ts
│   │   │   │   ├── transactions/
│   │   │   │   └── ...
│   │   │   ├── plugins/        # Fastify plugins (auth, cors, jwt, rbac, tenant-context, swagger)
│   │   │   ├── app.ts          # App builder (registers all plugins + routes)
│   │   │   └── server.ts       # Entry point (starts Fastify + Socket.IO)
│   │   └── .env.example
│   │
│   └── pos/                    # React PWA
│       ├── src/
│       │   ├── components/     # UI components (layout, pos, auth, admin, pwa)
│       │   ├── pages/          # Page components (dashboard, pos, admin/*, login, register-*)
│       │   ├── stores/         # Zustand stores (auth, cart, register, ui, connectivity)
│       │   ├── services/       # API client + service modules
│       │   ├── lib/            # Utilities (offline-db, query-client)
│       │   └── app.tsx         # Root component + router
│       ├── e2e/                # Playwright E2E tests
│       └── .env.example
│
├── packages/
│   ├── db/                     # Database package
│   │   ├── src/
│   │   │   ├── schema/         # Drizzle table definitions (30+ tables)
│   │   │   ├── migrations/     # Generated SQL migrations (empty until db:generate)
│   │   │   ├── seed/           # Dev seed data
│   │   │   ├── client.ts       # Database client factory
│   │   │   └── migrate.ts      # Migration runner
│   │   └── drizzle.config.ts
│   │
│   ├── shared/                 # Shared types, schemas, utils
│   │   └── src/
│   │       ├── schemas/        # Zod validation schemas
│   │       ├── types/          # TypeScript interfaces
│   │       ├── utils/          # currency, tax, discount helpers
│   │       └── constants/      # Roles, loyalty tiers, etc.
│   │
│   ├── tsconfig/               # Shared TypeScript configs
│   └── eslint-config/          # Shared ESLint rules
│
├── docker/
│   ├── docker-compose.yml      # PostgreSQL + Redis + MinIO
│   └── postgres/init.sql       # Extensions + app role
│
├── scripts/
│   ├── setup.sh                # One-command full setup
│   └── reset-db.sh             # Drop + recreate + migrate + seed
│
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # Workspace package locations
└── turbo.json                  # Turborepo task definitions
```
