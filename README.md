# SmartPOS

Cloud-based Point of Sale system with a React PWA terminal and Flutter mobile owner dashboard.

## Architecture

```
smartpos/
├── apps/
│   ├── api/        # Fastify 5 REST API + Socket.IO
│   ├── pos/        # React 19 PWA (POS terminal)
│   └── mobile/     # Flutter (Owner Dashboard) — not yet scaffolded
├── packages/
│   ├── shared/     # Zod schemas, TypeScript types, utilities
│   ├── db/         # Drizzle ORM schema, migrations, seeds
│   ├── eslint-config/
│   └── tsconfig/
├── docker/         # Docker Compose (Postgres, Redis, MinIO)
└── scripts/        # setup.sh, reset-db.sh
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm 9 |
| Backend | Fastify 5, TypeScript, Drizzle ORM |
| Database | PostgreSQL 16 (with Row-Level Security) |
| Cache | Redis 7 |
| Object Storage | MinIO (S3-compatible) |
| POS Frontend | React 19, Vite 6, Zustand, TanStack Query, Tailwind CSS 4 |
| Mobile | Flutter + Riverpod |
| Auth | JWT (access + refresh tokens) + PIN login for cashiers |
| Real-time | Socket.IO |
| Offline | Service Worker (Workbox), IndexedDB (Dexie.js) |

## Prerequisites

- **Node.js** >= 22 ([download](https://nodejs.org))
- **pnpm** >= 9 (`npm install -g pnpm@9`)
- **Docker** & Docker Compose ([download](https://www.docker.com))
- **Git**

For the mobile app, you also need:
- **Flutter** >= 3.22 ([install guide](https://docs.flutter.dev/get-started/install))
- **Android Studio** or **Xcode** (for emulators)

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url> smartpos
cd smartpos
pnpm install
```

### 2. Start infrastructure

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:
- **PostgreSQL 16** on port 5432
- **Redis 7** on port 6379
- **MinIO** on port 9000 (console on 9001)

### 3. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
cp apps/pos/.env.example apps/pos/.env
```

The defaults work out of the box for local development. Edit `apps/api/.env` if you need to change any values.

**API environment variables** (`apps/api/.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://smartpos:smartpos_dev@localhost:5432/smartpos_dev` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_ACCESS_SECRET` | — | Minimum 32 characters. Change for production. |
| `JWT_REFRESH_SECRET` | — | Minimum 32 characters. Change for production. |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `PORT` | `3000` | API server port |
| `LOG_LEVEL` | `debug` | Pino log level |

**POS environment variables** (`apps/pos/.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3000/v1` | API base URL |

### 4. Set up the database

```bash
# Build shared packages first (DB schema depends on them)
pnpm build --filter="./packages/*"

# Run migrations
pnpm db:migrate

# Seed with demo data (1 tenant, 1 branch, demo users)
pnpm db:seed
```

### 5. Start development servers

```bash
pnpm dev
```

This starts both the API and POS dev servers concurrently:
- **API**: http://localhost:3000
- **POS**: http://localhost:5173
- **Health check**: http://localhost:3000/health

To start them individually:

```bash
pnpm --filter @smartpos/api dev    # API only
pnpm --filter @smartpos/pos dev    # POS only
```

### One-command setup

Alternatively, run the setup script which does steps 2-5 automatically:

```bash
bash scripts/setup.sh
```

## Demo Credentials

After seeding, the following accounts are available:

| Role | Email | Password | PIN |
|------|-------|----------|-----|
| Super Admin | admin@smartpos.dev | admin123 | — |
| Branch Manager | manager@smartpos.dev | manager123 | — |
| Cashier | cashier@smartpos.dev | cashier123 | 1234 |

## Common Commands

```bash
# Development
pnpm dev                          # Start all dev servers
pnpm build                        # Build everything
pnpm test                         # Run all tests
pnpm lint                         # Lint all packages
pnpm type-check                   # TypeScript type checking

# Database
pnpm db:migrate                   # Run pending migrations
pnpm db:seed                      # Seed demo data
pnpm db:generate                  # Generate migration from schema changes
bash scripts/reset-db.sh          # Drop and recreate database

# Individual packages
pnpm --filter @smartpos/api dev   # API dev server
pnpm --filter @smartpos/pos dev   # POS dev server
pnpm --filter @smartpos/api test  # API tests only
pnpm --filter @smartpos/pos test  # POS tests only

# Infrastructure
docker compose -f docker/docker-compose.yml up -d    # Start services
docker compose -f docker/docker-compose.yml down      # Stop services
docker compose -f docker/docker-compose.yml logs -f   # View logs

# Cleanup
pnpm clean                        # Remove all build artifacts + node_modules
```

## Project Structure

### API Modules (`apps/api/src/modules/`)

Each feature follows a vertical slice pattern:

```
modules/{feature}/
├── {feature}.repository.ts   # Data access (Drizzle queries)
├── {feature}.service.ts      # Business logic
├── {feature}.routes.ts       # Fastify route handlers
└── {feature}.test.ts         # Vitest tests
```

| Module | Endpoints | Description |
|--------|-----------|-------------|
| auth | `/v1/auth/*` | Login (email + PIN), token refresh, logout |
| users | `/v1/users/*` | User CRUD, role assignment, PIN reset |
| branches | `/v1/branches/*` | Branch CRUD |
| categories | `/v1/categories/*` | Product category CRUD |
| products | `/v1/products/*` | Product CRUD, barcode lookup |
| inventory | `/v1/inventory/*` | Stock levels, adjustments, movements |
| registers | `/v1/registers/*` | Open/close register, shift summary |
| transactions | `/v1/transactions/*` | Sale creation, void, history |
| reports | `/v1/reports/*` | Sales, products, cashiers, payments |

### POS Pages (`apps/pos/src/pages/`)

| Page | Route | Description |
|------|-------|-------------|
| Login | — | Email/password and PIN login |
| Register Select | — | Branch and register selection |
| Register Open | — | Enter opening float |
| Dashboard | `/` | Today's revenue, transactions, system status |
| POS Terminal | `/pos` | Product grid + cart + checkout |
| Products | `/admin/products` | Product management (CRUD) |
| Categories | `/admin/categories` | Category management |
| Reports | `/admin/reports` | Sales, top products, cashiers, payments |
| Users | `/admin/users` | User management, role assignment |
| Branches | `/admin/branches` | Branch management |
| Register Close | — | Cash count, variance calculation |

### Shared Package (`packages/shared/`)

- **Types**: TypeScript interfaces for all entities
- **Schemas**: Zod validation schemas shared between API and POS
- **Utils**: `roundMoney()`, `formatMoney()`, `parseMoney()`, tax and discount calculators
- **Constants**: Roles, payment methods, transaction types

## Offline Support

The POS app works offline with:

- **Service Worker** (Workbox): Precaches app shell and static assets
- **API Caching**: Product and category API responses cached for 24 hours
- **IndexedDB** (Dexie.js): Full product catalog stored locally for offline search
- **Sync Queue**: Transactions created offline are queued and synced when connectivity returns
- **Offline ID**: Each offline transaction gets a UUID for server-side deduplication

## Real-time Updates

Socket.IO runs on the API server at path `/ws`:

- Clients join a room by `branchId` on connect
- Server emits `transaction:created` and `transaction:voided` events
- POS header shows an online/offline connectivity indicator

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push/PR to `main` or `develop`:

1. **Lint & Type Check** — ESLint + `tsc --noEmit`
2. **Tests** — Vitest across all packages
3. **Build** — Full production build

## Key Design Decisions

- **Monetary values**: Stored as `DECIMAL(12,2)` in PostgreSQL, transferred as strings in JSON, calculated with `roundMoney()` to avoid floating-point errors
- **Tenant isolation**: PostgreSQL Row-Level Security (RLS) policies
- **Auth**: Short-lived JWT access tokens (15 min) + long-lived refresh tokens (7 days). PIN login produces shift-scoped tokens (8 hours)
- **Migrations**: Manually controlled SQL via Drizzle Kit (required for RLS policies)
- **ESM**: The entire codebase uses ES modules with `.js` extensions in imports

## License

Private - All rights reserved.
