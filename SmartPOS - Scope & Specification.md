cl# SmartPOS + Inventory Support App — Full Scope & Technical Specification

> **Version:** 3.0  
> **Last Updated:** 2026-02-19  
> **Status:** Draft  
> **Breaking Change from v2:** Complete architecture shift from self-hosted PostgreSQL to cloud-native Firebase (Google Cloud). No local server. No Docker deployment. No self-hosting option. No AWS — everything runs on Firebase / GCP.

---

## ⚠️ Architecture Mandate

> **SmartPOS is a cloud-hosted SaaS product. There is no local server, no Docker deployment, and no self-hosting option.**
>
> - The **backend** runs entirely on **Firebase** (Firestore, Cloud Functions, Firebase Auth, Cloud Messaging) hosted on **Google Cloud Platform (GCP)**. No AWS. No other cloud providers.
> - The **POS terminal** is a **React PWA** that connects directly to Firebase. Each device is self-sufficient — there is no store server, no local API, no Docker container.
> - The **mobile owner app** is a **Flutter** application connecting to the same Firebase backend.
> - **Offline mode** uses Firestore's built-in offline persistence. No custom sync queue, no IndexedDB (Dexie.js), no manual conflict resolution.
> - **Every POS terminal connects to the cloud.** If a store has 2 PCs and no server, it works. If a store has 10 tablets, it works. No infrastructure required at the store — just devices with browsers and internet.
>
> **If you are a developer reading this:** there is no `docker-compose.yml` for production, no `DEPLOY.md`, no server setup guide, no SSL certificate generation. The only infrastructure a store needs is a WiFi connection and a device with a browser.

---

## 1. Executive Summary

**Product:** SmartPOS — a cloud-based point-of-sale system with an integrated mobile owner dashboard app.  
**Target Market:** Small to medium retail businesses (1–50 employees, 1–10 branches).

### Problem Statement

Small and medium retailers lose revenue and operate inefficiently due to:

- **Manual, error-prone stock tracking** leading to phantom inventory and stockouts
- **Sales leakage** from unrecorded transactions, theft, and discount abuse
- **Zero real-time visibility** — owners only discover problems hours or days later
- **Disconnected branches** with no centralized view of performance
- **Tax non-compliance** from poor record-keeping
- **No data-driven decision making** — reorder points, pricing, and staffing are all guesswork

### Solution

SmartPOS is a two-component system:

1. **POS Terminal** (React PWA) — used by cashiers and floor managers at the point of sale. Runs in any browser. No installation. No local server.
2. **Owner Dashboard** (Flutter mobile app) — used by business owners and administrators for real-time oversight, inventory management, and analytics.

Both components connect directly to the **Firebase cloud backend**. There is no intermediate server at the store.

### Unique Selling Proposition

> An affordable, cloud-native POS system with a powerful mobile owner app that gives real-time visibility into sales, stock, and profit — anytime, anywhere — with built-in multi-branch support, offline capability, and local tax compliance out of the box. Zero hardware requirements beyond a browser.

---

## 2. User Roles & Permissions

| Role | Access Level | Description |
|------|-------------|-------------|
| **Super Admin** | Full system | Business owner. Full access to all branches, settings, financials, and user management. |
| **Branch Manager** | Branch-scoped | Manages a single branch. Can view reports, adjust inventory, process refunds, and manage cashiers for their branch. |
| **Cashier** | Register-scoped | Processes sales, applies pre-approved discounts, handles basic customer lookups. Cannot access reports or inventory management. |
| **Stockist** | Inventory-scoped | Receives goods, performs stock counts, manages transfers between branches. Cannot process sales. |
| **Auditor** | Read-only | View-only access to reports and transaction logs. Cannot modify any data. |

### Permission Matrix

| Action | Super Admin | Branch Manager | Cashier | Stockist | Auditor |
|--------|:-----------:|:--------------:|:-------:|:--------:|:-------:|
| Process sale | ✅ | ✅ | ✅ | ❌ | ❌ |
| Issue refund | ✅ | ✅ | ❌ | ❌ | ❌ |
| Void transaction | ✅ | ✅ | ❌ | ❌ | ❌ |
| View reports | ✅ | Branch only | ❌ | ❌ | ✅ |
| Manage inventory | ✅ | Branch only | ❌ | ✅ | ❌ |
| Manage users | ✅ | Branch staff | ❌ | ❌ | ❌ |
| System settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | Branch only | ❌ | ❌ | ✅ |

### How Roles Are Enforced

- **Firebase Auth** handles authentication (email/password login, custom claims for roles).
- **Custom claims** on the Firebase Auth token carry `role`, `tenantId`, and `branchIds[]`.
- **Firestore Security Rules** enforce tenant isolation and role-based access at the database level — this is the primary security boundary, not application code.
- **Cloud Functions** validate roles server-side for all write operations and sensitive reads.
- **PIN login** for cashiers: Cloud Function validates PIN, issues a Firebase custom token with shift-scoped claims (expires after 8 hours).

---

## 3. Core POS Terminal Features

> **Implementation note:** The POS terminal is a React 19 PWA. It connects directly to Firebase (Firestore, Auth, Cloud Functions). There is no REST API server between the POS and the database. Real-time listeners (`onSnapshot`) provide live data. Offline mode uses Firestore's built-in offline persistence.

### 3.1 Sales Processing

- **Transaction types:** Sale, Return, Exchange, Layaway, Hold/Recall
- **Payment methods:**
  - Cash (with change calculation)
  - Card (credit/debit via integrated payment terminal — device-side, not SmartPOS-managed)
  - Mobile money (M-Pesa, Airtel Money, etc. — configurable per region)
  - Split payments (any combination of the above)
  - Store credit
  - Account/tab (for approved customer accounts)
- **Tax handling:**
  - Configurable tax rates per product category
  - Tax-inclusive and tax-exclusive pricing modes
  - Multi-tax support (VAT + levy, etc.)
  - Tax exemption per customer or per transaction with reason code
- **Cart operations:**
  - Add by barcode scan, SKU search, or product name search
  - Quantity adjustment (+/- or manual entry)
  - Line-item discount (percentage or fixed amount)
  - Cart-level discount (percentage or fixed amount)
  - Discount requires manager PIN if above configured threshold
  - Add notes to individual line items or entire transaction
  - Park (hold) transaction and recall later
  - Multiple open carts per terminal

**How checkout works (technical flow):**

1. Cashier builds cart in local React state (Zustand store)
2. On checkout, POS calls a **Cloud Function** (`createTransaction`)
3. The Cloud Function executes a **Firestore transaction** (atomic batch) that:
   - Creates the transaction document
   - Creates transaction item sub-documents
   - Creates payment document(s)
   - Decrements stock levels for the branch
   - Updates customer loyalty points (if applicable)
   - Logs to audit trail
4. All of this is atomic — it all succeeds or all fails
5. Firestore real-time listeners on other terminals instantly see the stock change
6. If offline: Firestore SDK queues the Cloud Function call and executes when connectivity returns

### 3.2 Barcode & Product Lookup

- USB and Bluetooth barcode scanner support (device-level — scanners output as keyboard input)
- Camera-based scanning as fallback (mobile/tablet) — using a client-side library (e.g., `html5-qrcode`)
- Supports UPC-A, UPC-E, EAN-13, EAN-8, Code 128, QR Code
- Quick product search by name, SKU, or category with type-ahead
- Product image display on scan for visual confirmation
- Weighted item support (price-per-unit with manual weight entry or scale integration)

**Search implementation:** Firestore does not support full-text search natively. Options:
- **Phase 1:** Client-side filtering on the cached product list (Firestore offline cache holds the full product catalog — feasible for <10,000 products)
- **Phase 2+:** Algolia or Typesense integration via Cloud Function indexing trigger for tenants with large catalogs

### 3.3 Receipt Management

- **Thermal printer support** (ESC/POS protocol — Epson, Star Micronics, etc.) via browser WebUSB API or vendor SDKs
- **Digital receipts** via email (SendGrid / Firebase Extensions) or SMS (Twilio)
- **Receipt customization:**
  - Business logo and name
  - Custom header/footer text
  - Return policy text
  - Configurable fields (cashier name, branch, transaction ID)
- **Receipt reprint** from transaction history
- **Gift receipts** (no prices shown)

### 3.4 Discounts & Promotions

| Promotion Type | Description |
|---------------|-------------|
| Percentage discount | X% off item or cart |
| Fixed amount discount | $X off item or cart |
| Buy X Get Y | Buy N of item A, get M of item B free or discounted |
| Bundle pricing | Set price for a group of items bought together |
| Happy hour / Time-based | Auto-applies during configured time windows |
| Loyalty reward | Auto-applies when customer reaches point threshold |
| Coupon code | Manual entry, single-use or multi-use with limits |

- Promotions have start/end dates and can be branch-specific
- Stacking rules: configurable whether promotions combine or best-price-wins
- Manager override required for manual discounts above threshold
- **Promotion validation runs in a Cloud Function** — the POS sends the cart, the function returns applicable promotions and adjusted totals. This prevents client-side tampering.

### 3.5 Cash Register Management

- **Open/close register** with starting float amount
- **Cash count** at end of shift (denomination breakdown)
- **Cash drop** (mid-shift safe drop recording)
- **Over/short calculation** with variance reporting
- **Register-to-user binding** — each shift is tied to a cashier
- **Blind close option** (cashier enters count before seeing expected total)

### 3.6 Customer Management

- **Customer profiles:** name, phone, email, tax ID, notes
- **Purchase history** per customer (query transactions by `customerId`)
- **Loyalty program:**
  - Points earned per currency unit spent (configurable ratio)
  - Points redeemable as payment
  - Tier system (Bronze, Silver, Gold) with tier-specific earn rates
- **Customer account/tab** with credit limits and payment terms
- **Quick lookup** by phone number at checkout

### 3.7 Offline Mode

> **This is handled by Firestore's built-in offline persistence.** There is no custom IndexedDB sync layer, no Dexie.js, no manual sync queue. Firestore SDK does this automatically.

**How it works:**

1. When the POS loads, Firestore SDK caches the product catalog, categories, customers, and active promotions locally (automatic)
2. When offline, reads come from the local cache — the POS keeps working
3. Writes (sales, register operations) are queued by the Firestore SDK automatically
4. When connectivity returns, queued writes are sent to the server in order
5. The `createTransaction` Cloud Function processes each queued sale atomically
6. If a queued write fails (e.g., insufficient stock after sync), the Cloud Function returns an error that the POS displays to the user

**What works offline:**
- Sales processing (cash payments only)
- Returns
- Product lookup and search (from cache)
- Receipt printing (thermal printer is local)
- Cart operations (hold/recall)
- Register open/close

**What does NOT work offline:**
- Card payments (requires network)
- Mobile money payments (requires network)
- Real-time stock checks across branches
- Loyalty point redemption (requires server validation)
- New user login (requires Firebase Auth)
- Report generation (requires Cloud Function)

**Visual indicator:** The POS header shows online/offline status and the count of pending writes.

**Conflict handling for stock:**
- Firestore transactions in the `createTransaction` Cloud Function read current stock and decrement atomically
- If two offline terminals both sell the last unit, the first to sync succeeds; the second gets an `INSUFFICIENT_STOCK` error
- The POS displays this error clearly and the cashier handles it (e.g., apologize to customer, refund)
- This is an accepted edge case — identical to what happens with any POS system when offline

---

## 4. Owner Dashboard App (Flutter Mobile)

> **Implementation note:** The mobile app is built with Flutter + Riverpod. It connects directly to Firebase (Firestore, Auth, Cloud Functions, Cloud Messaging). Real-time data uses Firestore `snapshots()` streams.

### 4.1 Real-Time Dashboard

- **Today's snapshot:**
  - Total revenue (vs. yesterday, vs. same day last week)
  - Transaction count
  - Average transaction value
  - Top 5 selling products
  - Active registers and current cashiers
- **Live feed:** scrolling list of transactions as they happen (Firestore `onSnapshot` on the transactions collection, ordered by `createdAt desc`, limited to today)
- **Branch selector:** toggle between individual branches or aggregate view
- **Push notifications** (Firebase Cloud Messaging) for:
  - Refunds above threshold
  - Voids
  - Register over/short exceeding tolerance
  - Low stock alerts
  - Daily summary at configurable time

### 4.2 Sales Analytics

- **Time range selector:** today, yesterday, this week, this month, custom range
- **Revenue breakdown by:**
  - Payment method
  - Product category
  - Branch
  - Cashier
  - Hour of day (heat map)
- **Product performance:**
  - Top sellers by quantity and revenue
  - Slow movers (items with zero or declining sales)
  - Margin analysis (gross profit per product)
  - ABC analysis (A = top 20% revenue, B = next 30%, C = bottom 50%)
- **Trend charts:** line graphs showing revenue, transaction count, and average basket over time
- **Comparison mode:** compare two time periods or two branches side by side
- **Export:** CSV and PDF report generation

**How analytics work (technical):**

Firestore is not optimized for complex aggregations. The analytics strategy is:

1. **Real-time counters:** Cloud Functions maintain pre-aggregated counter documents (daily revenue, transaction count, category totals) — updated on every transaction via Firestore triggers. These power the dashboard.
2. **Complex reports (margin analysis, ABC, trends):** A **scheduled Cloud Function** runs nightly (or on-demand) that reads raw transaction data from Firestore (or from a BigQuery export — see below) and writes summary documents to a `reports` collection.
3. **BigQuery export (Phase 2+):** Enable the Firebase → BigQuery export extension. All Firestore writes stream to BigQuery automatically. Complex SQL queries run against BigQuery for heavy analytics. This is the long-term reporting backbone.
4. **Client-side aggregation:** For simple reports (today's sales by payment method), the mobile app or POS can query Firestore directly and aggregate in-app. Only used for small, bounded datasets.

### 4.3 Inventory Management

- **Product catalog management:**
  - Add/edit products: name, SKU, barcode, description, category, unit of measure
  - Cost price, selling price, margin calculation
  - Product images (up to 3 per product) — stored in **Firebase Storage** (Cloud Storage bucket)
  - Product variants (size, color, etc.) as subcollection under product
  - Product status: active, inactive, discontinued
- **Stock levels:**
  - Current quantity per branch
  - Reorder point (configurable per product)
  - Maximum stock level
  - Stock value (at cost and at retail)
- **Stock movements:**
  - Automatic deduction on sale (via `createTransaction` Cloud Function)
  - Automatic addition on received purchase order (via `receivePurchaseOrder` Cloud Function)
  - Manual adjustment with mandatory reason code (damage, theft, count correction, etc.)
  - Inter-branch transfer with send/receive confirmation
- **Stock count (physical inventory):**
  - Full count or cycle count (by category/location)
  - Count sheet generation (print or in-app)
  - Variance report (expected vs. counted)
  - Manager approval required to commit adjustments
- **Alerts** (via Cloud Functions + FCM push notifications):
  - Low stock (quantity <= reorder point) — triggered on every stock level change
  - Overstock (quantity > max level)
  - Expiring stock (for perishable goods with batch/expiry tracking) — checked by scheduled function
  - Negative stock (should never happen but flagged if it does)

### 4.4 Supplier & Purchase Order Management

- **Supplier profiles:** name, contact, email, phone, payment terms, lead time, notes
- **Purchase orders (PO):**
  - Create PO from suggested reorder list or manually
  - PO statuses: Draft → Sent → Partially Received → Fully Received → Closed
  - Email PO directly to supplier from app (via SendGrid Cloud Function)
  - Receive goods against PO (partial receiving supported) — `receivePurchaseOrder` Cloud Function atomically updates stock
  - Cost price auto-update on receiving (optional, with confirmation)
  - PO history per supplier
- **Supplier performance:**
  - Average lead time
  - Order fill rate
  - Price history per product

### 4.5 Profit & Financial Reports

- **Profit & Loss summary:**
  - Revenue − COGS = Gross Profit
  - Gross margin percentage
  - Breakdown by category, branch, time period
- **Stock valuation report:**
  - Total inventory value at cost
  - Total inventory value at retail
  - Potential margin if all stock sold
- **Cash flow:**
  - Daily cash collected vs. expected
  - Payment method breakdown
  - Outstanding customer accounts
- **Tax report:**
  - Total tax collected by rate/type
  - Tax-exempt transaction summary
  - Export-ready format for filing

> All financial reports are generated by Cloud Functions reading from pre-aggregated data or BigQuery. Monetary values are stored as integers (cents) in Firestore to avoid floating-point errors. Displayed values are formatted client-side.

---

## 5. Multi-Branch Architecture

### 5.1 Data Model

- All entities are **tenant-scoped** (multi-tenant SaaS)
- Tenant isolation is enforced by **Firestore Security Rules** — every document read/write rule checks that `request.auth.token.tenantId == resource.data.tenantId`
- Within a tenant, data is **branch-aware:**
  - Products/catalog: shared across branches (tenant-level collection)
  - Prices: can have branch-specific overrides (map field on product or subcollection)
  - Stock: tracked per branch (keyed by `branchId` in the `stockLevels` collection)
  - Transactions: belong to a branch (`branchId` field)
  - Users: assigned to one or more branches (`branchIds[]` on user document and Auth custom claims)
  - Promotions: can be tenant-wide or branch-specific (`branchIds[]` — empty = all branches)

### 5.2 Branch Management

- Add/remove branches
- Branch profile: name, address, phone, operating hours, tax settings
- Branch-specific receipt customization
- Transfer stock between branches with approval workflow (Cloud Function)
- Consolidated reporting across all branches or per-branch drill-down

---

## 6. Technical Architecture

### 6.1 System Architecture Overview

```
                    ┌──────────────────────┐
                    │   Firebase Hosting    │
                    │   (POS PWA static)    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
    ┌─────────▼─────────┐     │     ┌───────────▼───────────┐
    │  POS Web App       │     │     │  Mobile App (Owner)    │
    │  (React 19 PWA)    │     │     │  (Flutter + Riverpod)  │
    │                    │     │     │                        │
    │  Connects directly │     │     │  Connects directly     │
    │  to Firebase SDK   │     │     │  to Firebase SDK       │
    └─────────┬─────────┘     │     └───────────┬───────────┘
              │               │                  │
              └───────────────┼──────────────────┘
                              │
                   ┌──────────▼──────────┐
                   │                     │
                   │   FIREBASE CLOUD    │
                   │                     │
                   ├─────────────────────┤
                   │                     │
                   │  ┌───────────────┐  │
                   │  │ Firebase Auth │  │    ── Authentication + custom claims
                   │  └───────────────┘  │       (roles, tenantId, branchIds)
                   │                     │
                   │  ┌───────────────┐  │
                   │  │  Firestore    │  │    ── Primary database
                   │  │  (NoSQL)      │  │       Real-time listeners
                   │  │               │  │       Built-in offline persistence
                   │  └───────────────┘  │       Security Rules for tenant isolation
                   │                     │
                   │  ┌───────────────┐  │
                   │  │ Cloud         │  │    ── Business logic
                   │  │ Functions v2  │  │       Transaction processing (atomic)
                   │  │ (Node.js)     │  │       Report generation
                   │  └───────────────┘  │       Push notifications
                   │                     │       Firestore triggers
                   │  ┌───────────────┐  │
                   │  │ Cloud Storage │  │    ── Product images
                   │  │ (Firebase     │  │       Receipt PDFs
                   │  │  Storage)     │  │       Report exports
                   │  └───────────────┘  │
                   │                     │
                   │  ┌───────────────┐  │
                   │  │ Cloud         │  │    ── Push notifications
                   │  │ Messaging     │  │       (low stock, voids, daily summary)
                   │  │ (FCM)         │  │
                   │  └───────────────┘  │
                   │                     │
                   └──────────┬──────────┘
                              │
                   ┌──────────▼──────────┐
                   │  Google BigQuery     │    ── Analytics & complex reporting
                   │  (Firestore export)  │       SQL queries on transaction history
                   └─────────────────────┘       7-year data retention
```

**There is no API server.** The POS and mobile app connect directly to Firebase services via their respective SDKs. Business logic that must run server-side (transaction processing, stock updates, role assignment) runs in Cloud Functions.

### 6.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **POS Frontend** | React 19 + TypeScript, Vite, Zustand, TanStack Query, Tailwind CSS 4, PWA (Workbox) | Runs in browser on any device, offline via Firestore SDK + service worker for app shell |
| **Mobile App** | Flutter 3.22+ + Riverpod | Single codebase for iOS + Android, native performance, excellent Firebase SDKs |
| **Authentication** | Firebase Auth | Email/password, custom tokens for PIN login, custom claims for RBAC |
| **Database** | Cloud Firestore | Real-time sync, built-in offline persistence, security rules for tenant isolation, horizontal scaling |
| **Server Logic** | Cloud Functions for Firebase v2 (Node.js 22 + TypeScript) | Atomic transactions, Firestore triggers, scheduled jobs, business logic that must be tamper-proof |
| **File Storage** | Firebase Storage (Cloud Storage) | Product images, receipt PDFs, report exports |
| **Push Notifications** | Firebase Cloud Messaging (FCM) | Low stock alerts, void alerts, daily summaries |
| **Analytics / Reporting** | BigQuery (via Firestore export extension) | Complex SQL analytics, 7-year data retention, P&L reports, trend analysis |
| **Search (Phase 2+)** | Algolia or Typesense (via Cloud Function indexing) | Full-text product search for large catalogs (>10k products) |
| **Email** | SendGrid (via Cloud Functions) | Digital receipts, PO emails to suppliers |
| **SMS** | Twilio (via Cloud Functions) | Digital receipts, OTP verification |
| **Hosting** | Firebase Hosting | POS PWA static files, CDN-distributed |
| **CI/CD** | GitHub Actions | Automated testing, linting, Firebase deployment |
| **Monitoring** | Firebase Crashlytics (mobile), Sentry (web), Cloud Monitoring | Error tracking, performance monitoring |
| **Monorepo** | Turborepo + pnpm | Shared types, schemas, utilities between POS, Cloud Functions, and (optionally) mobile |

### 6.3 What Runs Where

| Logic | Where it runs | Why |
|-------|--------------|-----|
| Cart management (add/remove items, quantities) | **Client** (React state / Zustand) | Fast, no network needed, no security concern |
| Product search & browsing | **Client** (reads from Firestore cache) | Real-time listener keeps cache fresh; works offline |
| Checkout / create transaction | **Cloud Function** (`createTransaction`) | Must be atomic (stock deduction + transaction creation); must be tamper-proof |
| Void / refund | **Cloud Function** | Must validate permissions, restore stock atomically, log audit |
| Apply promotions to cart | **Cloud Function** (`validatePromotions`) | Prevents client-side tampering with discounts |
| Register open/close | **Cloud Function** | Validates shift logic, calculates expected cash |
| Stock adjustment | **Cloud Function** | Requires reason code, audit logging |
| Stock transfer | **Cloud Function** | Two-branch atomic operation |
| User management / role assignment | **Cloud Function** | Sets Firebase Auth custom claims (requires Admin SDK) |
| PIN login | **Cloud Function** (`pinLogin`) | Validates hashed PIN, returns Firebase custom token |
| Report generation | **Cloud Function** (scheduled or on-demand) | Reads from Firestore/BigQuery, writes summary documents |
| Push notifications | **Cloud Function** (Firestore trigger) | Fires on void, refund, low stock, etc. |
| Daily aggregation | **Scheduled Cloud Function** (runs at midnight per tenant timezone) | Pre-aggregates daily totals for fast dashboard loading |
| Product CRUD | **Client → Firestore** (with Security Rules) | Simple writes; Security Rules enforce tenant isolation and role check |
| Customer CRUD | **Client → Firestore** (with Security Rules) | Same as products |
| Reading reports | **Client** (reads pre-aggregated documents from Firestore) | Dashboard reads summary docs; no heavy queries on the client |

### 6.4 Offline Sync Strategy

> **There is no custom sync implementation.** Firestore's SDK handles offline persistence automatically.

1. **On first load**, the POS sets up Firestore listeners for: products, categories, customers, active promotions, stock levels (for the current branch), and the current register state. Firestore SDK caches all of this locally.
2. **Reads while offline** come from the local cache automatically. The POS keeps working.
3. **Writes while offline** (e.g., calling the `createTransaction` Cloud Function) are queued by the Firestore SDK.
4. **When connectivity returns**, queued writes are sent to the server in order. Cloud Functions process each one.
5. **If a queued write fails** (e.g., stock conflict), the error is surfaced to the user on the POS.

**Important constraints while offline:**
- Card and mobile money payments cannot be processed (require network)
- Loyalty point redemption is disabled (requires server-side validation to prevent double-spend)
- New user logins are not possible (Firebase Auth requires network)
- Reports cannot be generated
- Stock levels shown may be stale (not reflecting sales from other offline terminals)

**Stock conflict resolution:**
- The `createTransaction` Cloud Function uses a Firestore transaction that reads current stock and decrements atomically
- If stock is insufficient at the time of sync, the function rejects the sale with an `INSUFFICIENT_STOCK` error
- The POS shows this error to the cashier, who must handle it (e.g., refund the customer if the item was already given)
- This is an accepted, documented edge case. It is identical to the behavior of all offline-capable POS systems.

### 6.5 Firestore Data Model

> **Key design principle:** Firestore is not a relational database. Data is organized into collections and subcollections optimized for the app's read patterns. Denormalization is intentional. Some data is duplicated across documents to avoid joins (which Firestore does not support).

```
firestore/
│
├── tenants/{tenantId}
│   ├── name: string
│   ├── subscriptionPlan: string
│   ├── settings: map (currency, timezone, taxMode, loyaltyConfig, etc.)
│   ├── createdAt: timestamp
│   │
│   ├── branches/{branchId}
│   │   ├── name, address, phone, operatingHours, taxSettings, isActive
│   │   ├── receiptConfig: map (logo, header, footer, returnPolicy)
│   │   │
│   │   ├── registers/{registerId}
│   │   │   ├── name, status (open/closed)
│   │   │   ├── openedBy, openedAt, openingFloat
│   │   │   ├── closedAt, closingCount, expectedCash, variance
│   │   │   └── currentCashierId
│   │   │
│   │   ├── stockLevels/{productId}
│   │   │   ├── quantity: number
│   │   │   ├── variantQuantities: map { [variantId]: number }  (if product has variants)
│   │   │   └── updatedAt: timestamp
│   │   │
│   │   └── stockMovements/{movementId}
│   │       ├── productId, variantId (nullable)
│   │       ├── quantityChange: number (+/-)
│   │       ├── movementType: string (sale, return, purchase_receive, adjustment, transfer_in, transfer_out, count_correction)
│   │       ├── reason: string (nullable)
│   │       ├── referenceId: string (links to transaction, PO, transfer)
│   │       ├── performedBy: string (userId)
│   │       └── createdAt: timestamp
│   │
│   ├── users/{userId}
│   │   ├── email, fullName, role, isActive, branchIds[]
│   │   ├── pinHash: string (nullable — bcrypt hash of PIN)
│   │   └── createdAt: timestamp
│   │   (NOTE: Firebase Auth is the source of truth for auth. This document stores app-specific profile data.)
│   │
│   ├── categories/{categoryId}
│   │   ├── name, parentCategoryId (nullable), sortOrder
│   │
│   ├── taxRates/{taxRateId}
│   │   ├── name, rate (decimal stored as number, e.g., 0.15), isDefault
│   │
│   ├── products/{productId}
│   │   ├── categoryId, name, sku, barcode (nullable), description
│   │   ├── unitOfMeasure: string
│   │   ├── costPrice: number (in cents/smallest currency unit)
│   │   ├── sellingPrice: number (in cents)
│   │   ├── taxRateId: string
│   │   ├── isActive, trackInventory: boolean
│   │   ├── reorderPoint, maxStockLevel: number (nullable)
│   │   ├── imageUrls: string[]
│   │   ├── branchPriceOverrides: map { [branchId]: { costPrice, sellingPrice } }
│   │   ├── createdAt, updatedAt: timestamp
│   │   │
│   │   └── variants/{variantId}
│   │       ├── name (e.g., "Large / Red"), sku, barcode
│   │       ├── costPriceOverride, sellingPriceOverride (nullable, in cents)
│   │       └── isActive
│   │
│   ├── customers/{customerId}
│   │   ├── name, phone, email, taxId, notes
│   │   ├── loyaltyPoints: number, loyaltyTier: string
│   │   ├── accountBalance: number (cents), accountLimit: number (cents)
│   │   └── createdAt: timestamp
│   │
│   ├── transactions/{transactionId}
│   │   ├── branchId, registerId, cashierId
│   │   ├── customerId (nullable)
│   │   ├── transactionType: string (sale, return, exchange)
│   │   ├── subtotal, discountTotal, taxTotal, grandTotal: number (all in cents)
│   │   ├── status: string (completed, voided, refunded, partially_refunded)
│   │   ├── notes: string (nullable)
│   │   ├── offlineId: string (nullable — client-generated UUID for deduplication)
│   │   ├── createdAt: timestamp
│   │   │
│   │   ├── items/{itemId}  (subcollection)
│   │   │   ├── productId, variantId (nullable)
│   │   │   ├── productNameSnapshot: string
│   │   │   ├── quantity, unitPrice, discountAmount, taxAmount, lineTotal: number (cents)
│   │   │
│   │   └── payments/{paymentId}  (subcollection)
│   │       ├── method: string (cash, card, mobile_money, store_credit, account)
│   │       ├── amount: number (cents)
│   │       ├── reference: string (nullable)
│   │       └── createdAt: timestamp
│   │
│   ├── suppliers/{supplierId}
│   │   ├── name, contactPerson, email, phone, paymentTerms, leadTimeDays, notes
│   │
│   ├── purchaseOrders/{poId}
│   │   ├── branchId, supplierId
│   │   ├── status: string (draft, sent, partially_received, fully_received, closed, cancelled)
│   │   ├── totalAmount: number (cents)
│   │   ├── notes, createdBy, createdAt, expectedDeliveryDate
│   │   │
│   │   └── items/{poItemId}
│   │       ├── productId, variantId (nullable)
│   │       ├── quantityOrdered, quantityReceived: number
│   │       └── unitCost: number (cents)
│   │
│   ├── promotions/{promotionId}
│   │   ├── name, type, config (map), startDate, endDate
│   │   ├── branchIds: string[] (empty = all branches)
│   │   ├── isActive, maxUses, currentUses
│   │
│   ├── auditLog/{logId}
│   │   ├── branchId (nullable), userId
│   │   ├── action: string (e.g., "transaction.void", "product.price_change")
│   │   ├── entityType, entityId
│   │   ├── oldValues, newValues: map (nullable)
│   │   ├── ipAddress: string
│   │   └── createdAt: timestamp
│   │
│   ├── heldCarts/{cartId}
│   │   ├── branchId, registerId, cashierId
│   │   ├── items: array of { productId, variantId, name, quantity, unitPrice, discount }
│   │   ├── customerId (nullable), notes
│   │   └── createdAt: timestamp
│   │
│   ├── stockTransfers/{transferId}
│   │   ├── fromBranchId, toBranchId
│   │   ├── status: string (pending, in_transit, received, cancelled)
│   │   ├── items: array of { productId, variantId, quantity }
│   │   ├── createdBy, createdAt, receivedBy, receivedAt
│   │
│   ├── stockCounts/{countId}
│   │   ├── branchId, type (full, cycle), status (in_progress, pending_approval, committed)
│   │   ├── categoryFilter: string (nullable — for cycle counts)
│   │   ├── createdBy, createdAt, approvedBy, approvedAt
│   │   │
│   │   └── items/{countItemId}
│   │       ├── productId, variantId (nullable)
│   │       ├── expectedQuantity, countedQuantity, variance
│   │
│   └── dailyAggregates/{YYYY-MM-DD_branchId}
│       ├── branchId, date: string
│       ├── totalRevenue, transactionCount, avgTransactionValue: number
│       ├── revenueByPaymentMethod: map { cash, card, mobile_money, ... }
│       ├── revenueByCategory: map { [categoryId]: number }
│       ├── revenueByCashier: map { [userId]: number }
│       ├── revenueByHour: map { "08": number, "09": number, ... }
│       ├── topProducts: array of { productId, name, quantity, revenue }
│       ├── totalTax, totalDiscount, totalCOGS, grossProfit: number
│       └── updatedAt: timestamp
```

**Key design decisions:**

1. **Monetary values are stored as integers (cents/smallest currency unit).** `sellingPrice: 1999` means $19.99 (or 19.99 of whatever currency). This avoids floating-point errors. The client formats for display.

2. **`dailyAggregates` collection** is the primary data source for the dashboard and reports. Updated in real-time by the `createTransaction` Cloud Function (increment counters) and reconciled by a nightly scheduled function.

3. **`stockLevels` is a subcollection of `branches`**, not products. This makes it fast to query "all stock for branch X" (common) vs. "all branches with product Y" (less common, done via collection group query).

4. **Transaction items and payments are subcollections**, not arrays, to avoid the Firestore 1MB document size limit for high-volume tenants and to allow individual item queries.

5. **`offlineId` on transactions** is a client-generated UUID. The `createTransaction` Cloud Function checks for duplicates (idempotency key) to prevent double-processing of offline-queued sales.

6. **`productNameSnapshot` on transaction items** captures the product name at time of sale so historical transactions remain accurate even if the product is renamed or deleted.

7. **Denormalized data:** The `dailyAggregates` document duplicates data from transactions. This is intentional — Firestore charges per read, and reading one aggregate document is far cheaper than reading 500 transaction documents to build a dashboard.

### 6.6 Firestore Security Rules (Overview)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: get the tenant ID from the authenticated user's custom claims
    function getTenantId() {
      return request.auth.token.tenantId;
    }

    function getUserRole() {
      return request.auth.token.role;
    }

    function getBranchIds() {
      return request.auth.token.branchIds;
    }

    function isTenantMember() {
      return request.auth != null && getTenantId() != null;
    }

    function isTenantOwner(tenantId) {
      return isTenantMember() && getTenantId() == tenantId;
    }

    function isAdmin() {
      return getUserRole() == 'super_admin';
    }

    function isManagerOf(branchId) {
      return getUserRole() == 'branch_manager' && branchId in getBranchIds();
    }

    // Tenant-level: only members of this tenant can read/write
    match /tenants/{tenantId} {
      allow read: if isTenantOwner(tenantId);
      allow write: if isTenantOwner(tenantId) && isAdmin();

      // Products: any tenant member can read, admin/manager can write
      match /products/{productId} {
        allow read: if isTenantOwner(tenantId);
        allow create, update: if isTenantOwner(tenantId)
          && (isAdmin() || getUserRole() == 'branch_manager');
        allow delete: if isTenantOwner(tenantId) && isAdmin();

        match /variants/{variantId} {
          allow read: if isTenantOwner(tenantId);
          allow write: if isTenantOwner(tenantId)
            && (isAdmin() || getUserRole() == 'branch_manager');
        }
      }

      // Transactions: created ONLY via Cloud Functions (not directly by client)
      match /transactions/{transactionId} {
        allow read: if isTenantOwner(tenantId)
          && (isAdmin() || getUserRole() == 'auditor'
              || (getUserRole() == 'branch_manager'
                  && resource.data.branchId in getBranchIds()));
        allow create, update, delete: if false;  // ← ONLY Cloud Functions can write

        match /items/{itemId} {
          allow read: if isTenantOwner(tenantId);
          allow write: if false;
        }
        match /payments/{paymentId} {
          allow read: if isTenantOwner(tenantId);
          allow write: if false;
        }
      }

      // Stock levels: read by tenant members, write ONLY via Cloud Functions
      match /branches/{branchId}/stockLevels/{productId} {
        allow read: if isTenantOwner(tenantId);
        allow write: if false;  // ← ONLY Cloud Functions can write
      }

      // Audit log: read by admin/auditor/manager, write ONLY via Cloud Functions
      match /auditLog/{logId} {
        allow read: if isTenantOwner(tenantId)
          && (isAdmin() || getUserRole() == 'auditor'
              || isManagerOf(resource.data.branchId));
        allow write: if false;
      }

      // ... similar rules for all other collections
    }
  }
}
```

**Key security principles:**
- **Transactions, stock levels, and audit logs can ONLY be written by Cloud Functions** (using the Admin SDK which bypasses Security Rules). This prevents any client-side tampering with sales data or stock.
- **Tenant isolation is enforced at the database level.** Even if application code has a bug, Security Rules prevent cross-tenant data access.
- **Branch scoping** for managers uses the `branchIds` array in their Auth custom claims.

### 6.7 Cloud Functions Reference

| Function | Trigger | What It Does |
|----------|---------|-------------|
| `createTransaction` | HTTPS callable | Atomically creates transaction + items + payments, decrements stock, updates loyalty, updates daily aggregates, logs audit. Checks `offlineId` for deduplication. |
| `voidTransaction` | HTTPS callable | Validates permissions, restores stock, updates transaction status, logs audit, sends push notification. |
| `refundTransaction` | HTTPS callable | Full or partial refund. Restores stock for returned items, creates refund payment record, logs audit. |
| `openRegister` | HTTPS callable | Validates no other open session, creates register open record. |
| `closeRegister` | HTTPS callable | Calculates expected cash from shift transactions, records variance, closes register. |
| `validatePromotions` | HTTPS callable | Takes cart contents, returns applicable promotions and adjusted totals. |
| `pinLogin` | HTTPS callable | Validates PIN hash, returns Firebase custom token with shift-scoped claims. |
| `assignUserRole` | HTTPS callable | Admin-only. Sets Firebase Auth custom claims (role, branchIds). |
| `createUser` | HTTPS callable | Creates Firebase Auth user + Firestore profile + sets custom claims. |
| `receivePurchaseOrder` | HTTPS callable | Atomically updates PO status, increments stock levels, creates stock movements. |
| `transferStock` | HTTPS callable | Atomically decrements source branch stock, creates pending transfer. |
| `receiveTransfer` | HTTPS callable | Atomically increments destination branch stock, completes transfer. |
| `commitStockCount` | HTTPS callable | Manager-approved. Calculates variance, adjusts stock levels, logs all corrections. |
| `onTransactionCreate` | Firestore trigger | Updates `dailyAggregates`, checks for void/refund threshold alerts, sends FCM. |
| `onStockLevelUpdate` | Firestore trigger | Checks reorder point, sends low-stock FCM push notification. |
| `dailyAggregation` | Scheduled (midnight) | Reconciles daily aggregate documents, generates daily summary push notification. |
| `generateReport` | HTTPS callable | Generates complex reports (P&L, ABC analysis) from BigQuery or Firestore data. Returns download URL for PDF/CSV. |
| `sendReceipt` | HTTPS callable | Sends digital receipt via email (SendGrid) or SMS (Twilio). |
| `emailPurchaseOrder` | HTTPS callable | Formats and sends PO to supplier via email. |
| `exportToBigQuery` | Firestore trigger (or use Firebase Extension) | Streams Firestore writes to BigQuery for long-term analytics. |

---

## 7. API Design

> **There is no traditional REST API.** The POS and mobile app interact with Firebase directly:
> - **Reads:** Firestore queries (with real-time listeners)
> - **Simple writes:** Direct Firestore writes (protected by Security Rules)
> - **Complex writes / business logic:** HTTPS callable Cloud Functions
>
> Cloud Functions are called via the Firebase SDK, not via HTTP URLs. The SDK handles authentication automatically.

### 7.1 Cloud Function Calling Convention

```typescript
// Client-side (React POS)
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const createTransaction = httpsCallable(functions, 'createTransaction');

const result = await createTransaction({
  branchId: 'branch-123',
  registerId: 'register-456',
  items: [
    { productId: 'prod-789', variantId: null, quantity: 2, unitPrice: 1999 },
    { productId: 'prod-012', variantId: 'var-345', quantity: 1, unitPrice: 4999 }
  ],
  payments: [
    { method: 'cash', amount: 8997, reference: null }
  ],
  customerId: null,
  discountTotal: 0,
  notes: null,
  offlineId: 'uuid-generated-on-client'
});

// result.data contains the created transaction
```

### 7.2 Error Format

Cloud Functions return errors using Firebase's `HttpsError`:

```typescript
// Server-side (Cloud Function)
throw new HttpsError('failed-precondition', 'Insufficient stock', {
  code: 'INSUFFICIENT_STOCK',
  productId: 'prod-789',
  available: 3,
  requested: 5
});
```

```typescript
// Client-side error handling
try {
  await createTransaction(data);
} catch (error) {
  if (error.code === 'functions/failed-precondition') {
    // Handle insufficient stock
  }
}
```

### 7.3 Function Input/Output Schemas

All Cloud Function inputs and outputs are validated using **Zod schemas** defined in the shared package (`packages/shared`). Both the Cloud Functions and the client apps import the same schemas.

```
packages/shared/src/schemas/
├── transaction.schema.ts    # CreateTransactionInput, TransactionOutput
├── register.schema.ts       # OpenRegisterInput, CloseRegisterInput
├── promotion.schema.ts      # ValidatePromotionsInput, PromotionResult
├── stockCount.schema.ts     # CommitStockCountInput
├── purchaseOrder.schema.ts  # ReceivePOInput
├── user.schema.ts           # CreateUserInput, AssignRoleInput
└── ...
```

---

## 8. Security

### 8.1 Authentication & Authorization

- **Login:** Email + password via Firebase Auth → Firebase ID token (auto-refreshed by SDK)
- **PIN login:** Cloud Function validates bcrypt-hashed PIN → Firebase custom token (shift-scoped, expires in 8 hours via custom claims)
- **Custom claims on every token:** `{ tenantId, role, branchIds[] }`
- **RBAC enforcement:**
  - Firestore Security Rules (primary boundary — enforces every read and write)
  - Cloud Functions validate roles for business logic operations
- **Tenant isolation:** Firestore Security Rules check `tenantId` on every operation. No tenant can ever read or write another tenant's data.
- **Rate limiting:** Firebase App Check + Cloud Functions rate limiting (100 calls/min per user)

### 8.2 Data Protection

- All data encrypted in transit (TLS 1.3 — handled by Firebase/Google Cloud)
- All data encrypted at rest (Google Cloud default encryption — AES-256)
- Passwords managed by Firebase Auth (bcrypt-equivalent hashing, handled by Google)
- PINs hashed with bcrypt in Cloud Functions before storing
- PCI DSS: SmartPOS does NOT store card numbers — payment terminal handles card data directly
- Audit log is append-only (Security Rules: `allow write: if false` for clients; only Cloud Functions can write)

### 8.3 Operational Security

- All destructive actions (void, refund, delete, price change) logged to `auditLog` by Cloud Functions
- Manager PIN required for overrides (refunds, discounts above threshold, voids)
- Session timeout: 8 hours for POS terminal (Firebase Auth custom token), 30 min idle for mobile app (app-level)
- Firebase App Check to prevent unauthorized API access from non-genuine apps
- Automatic account lockout after 5 failed login attempts (Firebase Auth built-in)

---

## 9. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Availability** | 99.9% uptime (Firebase SLA) |
| **Latency** | Cloud Function p95 response time < 500ms (cold starts may add 1-2s on first call; use min instances to mitigate) |
| **Transaction throughput** | Support 100 concurrent transactions per tenant (Firestore handles 10,000 writes/sec per database) |
| **Offline tolerance** | POS terminal operates fully offline for up to 72 hours (Firestore offline cache) |
| **Sync latency** | Offline transactions sync within 30 seconds of reconnection |
| **Data retention** | Transaction data retained for 7 years in BigQuery (Firestore data lifecycle managed separately) |
| **Backup** | Firestore daily automated backups with 30-day retention (point-in-time recovery via export) |
| **Scalability** | Automatic — Firestore and Cloud Functions scale horizontally with no configuration |
| **Mobile performance** | Dashboard app launches in < 2s, data loads in < 1s on 4G |
| **Accessibility** | POS UI meets WCAG 2.1 AA (high contrast, keyboard navigable) |
| **Localization** | i18n-ready — support for English + at least 2 regional languages at launch |
| **Browser support** | Chrome 100+, Edge 100+, Safari 16+ (POS terminal) |
| **Cost** | Firebase Blaze (pay-as-you-go). Estimated cost per tenant: $5-50/month depending on transaction volume. |

---

## 10. Development Roadmap

### Phase 1 — Foundation (Months 1-3)

**Goal:** A working cloud-based POS that can process sales, manage products, and generate basic reports.

| Deliverable | Details |
|-------------|---------|
| Project scaffolding | Monorepo (Turborepo + pnpm), Firebase project setup, CI/CD (GitHub Actions → Firebase deploy), dev/staging/prod environments |
| Firebase setup | Firestore database, Security Rules, Cloud Functions project, Firebase Auth configuration, Firebase Hosting |
| Auth system | Email/password login (Firebase Auth), PIN login (Cloud Function), custom claims (role, tenantId, branchIds), Firestore Security Rules for RBAC |
| Product catalog | CRUD (direct Firestore writes with Security Rules), categories, barcode field support, CSV import (Cloud Function) |
| Sales processing | Cart (Zustand), `createTransaction` Cloud Function (atomic stock deduction), cash + card payment recording |
| Register management | `openRegister` / `closeRegister` Cloud Functions, cash count, shift summary |
| Basic reporting | `dailyAggregates` collection, `onTransactionCreate` trigger, basic dashboard showing today's revenue/transactions |
| POS PWA | React 19 + Vite + Tailwind, Firestore SDK integration, offline persistence enabled, service worker for app shell caching |
| Shared package | Zod schemas, TypeScript types, monetary utility functions (`toCents`, `fromCents`, `formatMoney`), shared between Cloud Functions and POS |

**Exit Criteria:** A cashier opens a browser, logs in, scans items, processes a cash sale (with atomic stock deduction), and the owner can see the sale in real-time from another device. The sale works offline and syncs when the connection returns.

### Phase 2 — Inventory & Mobile (Months 3-5)

**Goal:** Full inventory management and the owner mobile app.

| Deliverable | Details |
|-------------|---------|
| Inventory tracking | Stock levels (per branch), auto-deduction on sale (already in Phase 1), manual adjustments with reason codes (Cloud Function) |
| Low stock alerts | `onStockLevelUpdate` Firestore trigger → FCM push notification when quantity ≤ reorder point |
| Supplier management | Supplier CRUD (Firestore), purchase order CRUD, `receivePurchaseOrder` Cloud Function (atomic stock update) |
| Stock counts | Physical count workflow, variance report, `commitStockCount` Cloud Function (manager approval) |
| Mobile app (Owner Dashboard) | Flutter + Riverpod, Firebase SDK integration, real-time dashboard, inventory overview, push notifications |
| Customer management | Customer CRUD, loyalty points (updated in `createTransaction`), phone lookup |
| Discounts & promotions | `validatePromotions` Cloud Function, percentage/fixed discounts, manager PIN override |
| Receipt system | Digital receipts via email (SendGrid) and SMS (Twilio) via Cloud Functions |

**Exit Criteria:** Owner receives a low-stock push notification on their phone, creates a PO in the Flutter app, stock is received and levels update in real-time; owner can see live sales from anywhere.

### Phase 3 — Multi-Branch & Advanced Features (Months 5-8)

**Goal:** Support for multiple locations and deeper analytics.

| Deliverable | Details |
|-------------|---------|
| Multi-branch | Branch CRUD, branch-scoped Security Rules, consolidated `dailyAggregates` (all-branches view) |
| Inter-branch transfers | `transferStock` / `receiveTransfer` Cloud Functions, transfer tracking |
| Advanced analytics | BigQuery export extension, `generateReport` Cloud Function (P&L, ABC analysis, trends, comparisons), report PDF/CSV export to Cloud Storage |
| Offline hardening | Stress testing offline mode (72-hour offline operation), conflict resolution UX, pending sync queue visibility |
| Loyalty program | Points earning/redemption, tier system, `redeemLoyaltyPoints` Cloud Function |
| Advanced promotions | BOGO, bundles, time-based, coupon codes (all validated server-side via `validatePromotions`) |
| Thermal printing | WebUSB integration for ESC/POS thermal printers |

**Exit Criteria:** Owner with 3 branches can view consolidated revenue, transfer stock between branches, and the POS works fully offline for 72 hours then syncs cleanly.

### Phase 4 — Scale & Integrate (Months 8-12)

**Goal:** Enterprise readiness, integrations, and intelligence.

| Deliverable | Details |
|-------------|---------|
| E-commerce integration | Sync products and stock with Shopify / WooCommerce via Cloud Functions |
| Accounting integration | Export to QuickBooks / Xero / CSV |
| AI reorder suggestions | Cloud Function using Vertex AI (or external ML API) analyzing sales velocity and lead times |
| AI sales forecasting | Revenue projections based on BigQuery historical data |
| Public API | REST API layer (Cloud Functions as HTTP endpoints) with API key auth and rate limiting for third-party integrations |
| Audit & compliance | Audit log viewer in mobile app, tax report exports, GDPR data export/deletion |
| Performance optimization | Cloud Function min instances (reduce cold starts), Firestore composite indexes, BigQuery query optimization |
| Firebase App Check | Prevent unauthorized API access from non-genuine apps |

**Exit Criteria:** A business can sync their SmartPOS catalog to their online store, receive AI-generated reorder suggestions, and export tax reports for filing.

---

## 11. Project Structure

```
smartpos/
├── apps/
│   ├── pos/                        # React 19 PWA (POS terminal)
│   │   ├── src/
│   │   │   ├── components/         # UI components (pos, auth, admin, layout)
│   │   │   ├── pages/              # Page components (dashboard, pos, admin/*)
│   │   │   ├── stores/             # Zustand stores (auth, cart, register, ui, connectivity)
│   │   │   ├── hooks/              # Custom hooks (useProducts, useTransaction, useRegister)
│   │   │   ├── lib/
│   │   │   │   ├── firebase.ts     # Firebase SDK initialization
│   │   │   │   ├── firestore.ts    # Firestore helpers (collection refs, converters)
│   │   │   │   └── functions.ts    # Cloud Function callable references
│   │   │   └── app.tsx             # Root component + router
│   │   ├── public/
│   │   │   └── sw.js               # Service worker (Workbox — app shell caching only)
│   │   ├── e2e/                    # Playwright E2E tests
│   │   └── .env                    # VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, etc.
│   │
│   └── mobile/                     # Flutter (Owner Dashboard)
│       ├── lib/
│       │   ├── providers/          # Riverpod providers
│       │   ├── models/             # Dart data classes
│       │   ├── screens/            # Dashboard, inventory, reports, settings
│       │   ├── services/           # Firebase service wrappers
│       │   └── main.dart
│       └── pubspec.yaml
│
├── packages/
│   ├── shared/                     # Shared TypeScript (used by POS + Cloud Functions)
│   │   └── src/
│   │       ├── schemas/            # Zod validation schemas (all Cloud Function inputs/outputs)
│   │       ├── types/              # TypeScript interfaces (all Firestore document types)
│   │       ├── utils/              # toCents(), fromCents(), formatMoney(), tax/discount calculators
│   │       └── constants/          # Roles, payment methods, transaction types, loyalty tiers
│   │
│   ├── functions/                  # Cloud Functions for Firebase
│   │   ├── src/
│   │   │   ├── transactions/       # createTransaction, voidTransaction, refundTransaction
│   │   │   ├── registers/          # openRegister, closeRegister
│   │   │   ├── auth/               # pinLogin, createUser, assignUserRole
│   │   │   ├── inventory/          # adjustStock, transferStock, receiveTransfer, commitStockCount
│   │   │   ├── purchaseOrders/     # receivePurchaseOrder, emailPurchaseOrder
│   │   │   ├── promotions/         # validatePromotions
│   │   │   ├── reports/            # generateReport, dailyAggregation (scheduled)
│   │   │   ├── notifications/      # FCM push notification helpers
│   │   │   ├── triggers/           # onTransactionCreate, onStockLevelUpdate
│   │   │   └── index.ts            # Export all functions
│   │   ├── .env                    # SENDGRID_API_KEY, TWILIO_SID, etc.
│   │   └── package.json
│   │
│   ├── tsconfig/                   # Shared TypeScript configs
│   └── eslint-config/              # Shared ESLint rules
│
├── firebase/
│   ├── firestore.rules             # Firestore Security Rules
│   ├── firestore.indexes.json      # Composite index definitions
│   ├── storage.rules               # Cloud Storage Security Rules
│   └── firebase.json               # Firebase project config (hosting, functions, firestore)
│
├── .github/
│   └── workflows/
│       ├── ci.yml                  # Lint, type-check, test on every PR
│       └── deploy.yml              # Deploy to Firebase on merge to main
│
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml
└── turbo.json                      # Turborepo task definitions
```

**What is NOT in this repo:**
- No `docker/` directory
- No `docker-compose.yml` (not even for development — use Firebase Emulator Suite instead)
- No `DEPLOY.md` with server setup instructions
- No `scripts/deploy.sh` for local server deployment
- No `scripts/generate-ssl.sh`
- No nginx configuration
- No MinIO configuration

---

## 12. Development Setup

> **Developers run the Firebase Emulator Suite locally.** There is no Docker, no PostgreSQL, no Redis, no local server.

### Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| **Node.js** | >= 22.0.0 | `node -v` |
| **pnpm** | >= 9.0.0 | `pnpm -v` |
| **Firebase CLI** | Latest | `firebase --version` |
| **Java** | >= 11 (required by Firestore emulator) | `java -version` |
| **Git** | Latest | `git -v` |

For the mobile app:
| **Flutter** | >= 3.22 | `flutter --version` |

### Setup Steps

```bash
# 1. Clone and install
git clone <repo-url> smartpos && cd smartpos
pnpm install

# 2. Install Firebase CLI (if not already)
npm install -g firebase-tools
firebase login

# 3. Build shared packages
pnpm build --filter="./packages/shared"

# 4. Start Firebase Emulator Suite (Firestore, Auth, Functions, Storage)
firebase emulators:start

# 5. In another terminal, start POS dev server
pnpm --filter @smartpos/pos dev

# 6. Open http://localhost:5173 — the POS connects to local emulators
```

The Firebase Emulator Suite provides:
- **Firestore Emulator** (port 8080) — local database with Security Rules enforcement
- **Auth Emulator** (port 9099) — local authentication
- **Functions Emulator** (port 5001) — local Cloud Functions
- **Storage Emulator** (port 9199) — local file storage
- **Emulator UI** (port 4000) — visual dashboard to inspect data, auth, logs

**Seeding demo data:** A seed script (`packages/functions/src/seed.ts`) populates the Firestore emulator with demo tenant, branches, users, products, and stock levels.

---

## 13. Deployment

> **Deployment is to Firebase. There is no server to manage.**

### Environments

| Environment | Firebase Project | Purpose |
|-------------|-----------------|---------|
| `dev` | `smartpos-dev` | Local emulators + shared dev project |
| `staging` | `smartpos-staging` | Pre-production testing |
| `production` | `smartpos-prod` | Live customer data |

### Deploy Commands

```bash
# Deploy everything (Firestore rules, indexes, Cloud Functions, Hosting)
firebase deploy --project smartpos-prod

# Deploy only Cloud Functions
firebase deploy --only functions --project smartpos-prod

# Deploy only Firestore rules
firebase deploy --only firestore:rules --project smartpos-prod

# Deploy only POS PWA (hosting)
pnpm --filter @smartpos/pos build
firebase deploy --only hosting --project smartpos-prod
```

### CI/CD Pipeline (GitHub Actions)

**On every PR:**
1. Lint + type-check all packages
2. Run unit tests (Vitest) and integration tests (against Firebase emulators)
3. Build all packages

**On merge to `main`:**
1. All of the above
2. Build POS PWA for production
3. Deploy Cloud Functions to `smartpos-prod`
4. Deploy Firestore rules and indexes to `smartpos-prod`
5. Deploy POS PWA to Firebase Hosting (`smartpos-prod`)

**On merge to `develop`:**
- Same pipeline but deploys to `smartpos-staging`

### What a Store Owner Does to "Deploy"

Nothing. They sign up, and it works. There is no installation, no server, no Docker. They:

1. Sign up on the SmartPOS website (creates tenant, admin user)
2. Log in from any browser on any device
3. Start using the POS

---

## 14. Testing Strategy

| Level | Scope | Tools |
|-------|-------|-------|
| **Unit tests** | Business logic, utilities, calculations (tax, discounts, stock, monetary) | Vitest |
| **Integration tests** | Cloud Functions against Firebase Emulator Suite | Vitest + Firebase Emulator |
| **Security Rules tests** | Firestore Security Rules (tenant isolation, RBAC) | `@firebase/rules-unit-testing` |
| **E2E tests** | Critical POS user journeys (sale flow, register close, offline mode) | Playwright |
| **Mobile tests** | App navigation, real-time updates, push notifications | Flutter integration tests |
| **Load tests** | Cloud Function throughput under concurrent transactions | k6 (against staging Firebase) |
| **Security tests** | OWASP top 10, auth bypass, tenant isolation verification | Manual + automated |

**Coverage target:** 80% line coverage for business logic, 100% coverage for financial calculations, 100% coverage for Firestore Security Rules.

---

## 15. Cost Estimation (Firebase Blaze Plan)

| Metric | Free Tier (per month) | Estimated per tenant (moderate use) |
|--------|----------------------|--------------------------------------|
| Firestore reads | 50,000/day | ~$0.50-5/month |
| Firestore writes | 20,000/day | ~$1-10/month |
| Firestore storage | 1 GiB | ~$0.50/month |
| Cloud Functions invocations | 2M/month | ~$0-5/month |
| Cloud Functions compute | 400K GB-seconds | ~$1-10/month |
| Firebase Auth | 50K MAUs free | $0 (under threshold) |
| Firebase Storage | 5 GB | ~$0-2/month |
| Firebase Hosting | 10 GB | ~$0 |
| **Estimated total per tenant** | | **$5-30/month** |

> These costs are borne by SmartPOS (us), not the store owner. We charge a subscription fee that covers Firebase costs + margin.

---

## 16. Success Metrics

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Monthly Active Tenants | 200+ |
| Transactions processed/month | 100,000+ |
| Uptime | 99.9% (Firebase SLA) |
| Average transaction processing time | < 3 seconds (scan to receipt) |
| Mobile app daily active users | 60% of tenant owners |
| Churn rate | < 5% monthly |
| NPS score | 50+ |
| Support ticket resolution | < 4 hours average |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Tenant** | A business (customer) using SmartPOS. All their data is isolated in Firestore under `/tenants/{tenantId}/`. |
| **Branch** | A physical store location belonging to a tenant. |
| **Register** | A logical cash register within a branch. One terminal = one register. |
| **SKU** | Stock Keeping Unit — unique product identifier within the tenant. |
| **PO** | Purchase Order — an order placed with a supplier for inventory replenishment. |
| **Float** | Starting cash placed in the register at the beginning of a shift. |
| **Variance** | Difference between expected cash in register and actual count at close. |
| **COGS** | Cost of Goods Sold — the cost price of items sold, used for profit calculation. |
| **Cloud Function** | Server-side function running on Google Cloud, triggered by HTTPS calls or Firestore events. Replaces the traditional API server. |
| **Custom Claims** | Key-value pairs attached to a Firebase Auth token (e.g., `tenantId`, `role`). Used by Security Rules for authorization. |
| **Firestore Security Rules** | Declarative rules that control read/write access to every document in Firestore. The primary security boundary. |
| **FCM** | Firebase Cloud Messaging — push notification service for mobile and web. |

---

## Appendix B: Migration Notes (v2 → v3)

> This section documents what changed from the v2 spec (self-hosted PostgreSQL) to v3 (Firebase cloud).

| v2 (Self-Hosted) | v3 (Firebase Cloud) | Reason |
|-------------------|---------------------|--------|
| PostgreSQL 16 (local Docker) | Cloud Firestore | No server to manage; built-in offline sync; real-time listeners; auto-scaling |
| Fastify REST API | Cloud Functions (HTTPS callable) | No server to deploy/maintain; scales automatically; pay-per-invocation |
| Redis (cache + pub/sub) | Firestore real-time listeners + pre-aggregated documents | Firestore listeners replace pub/sub for real-time; aggregated docs replace cache |
| MinIO (local S3) | Firebase Storage (Cloud Storage) | Managed, CDN-backed, integrated with Security Rules |
| Custom JWT (access + refresh) | Firebase Auth (ID tokens + custom claims) | Managed auth, handles token refresh, integrates with Security Rules |
| Docker Compose deployment | Firebase CLI deployment | One command deploys everything; no infrastructure management |
| Nginx reverse proxy | Firebase Hosting (CDN) | Global CDN, automatic SSL, no configuration |
| Custom IndexedDB sync (Dexie.js) | Firestore built-in offline persistence | Less code, battle-tested, maintained by Google |
| PostgreSQL RLS | Firestore Security Rules | Different mechanism, same result: tenant data isolation |
| Socket.IO (real-time) | Firestore `onSnapshot` listeners | Built into the database SDK; no separate WebSocket server |
| BullMQ (background jobs) | Cloud Functions (scheduled + triggered) | No Redis dependency; managed scheduling |
| Self-signed SSL certificates | Firebase Hosting (automatic SSL via Let's Encrypt) | No certificate management |
| Local server (store back room) | **No local infrastructure** | The entire point of this rewrite |

**What stayed the same:**
- React 19 PWA for POS terminal
- Flutter for mobile app
- TypeScript everywhere (POS + Cloud Functions + shared package)
- Zustand for client state
- Zod for validation schemas
- Turborepo + pnpm monorepo
- Vitest for testing
- GitHub Actions for CI/CD
- The business logic, feature set, and UX are identical
