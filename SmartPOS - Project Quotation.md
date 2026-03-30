# SmartPOS — Full Project Quotation

> **Document Version:** 1.1
> **Date:** 2026-02-25
> **Currency:** South African Rand (ZAR)
> **Project:** SmartPOS v3.0 — Cloud-Native SaaS Point-of-Sale System
> **Architecture:** Firebase (Firestore, Cloud Functions, Auth, Hosting, Storage, FCM)

---

## 1. Executive Summary

SmartPOS is a cloud-based SaaS point-of-sale system with an integrated mobile owner dashboard, targeting small to medium retail businesses (1–50 employees, 1–10 branches). The system runs entirely on Firebase/Google Cloud with no local server infrastructure required at the store — just a browser and WiFi.

This quotation covers the **full development lifecycle** across 4 phases, from core POS functionality through to AI-powered analytics and third-party integrations.

---

## 2. Current Project Status

### Completed Work

The following has been built, tested, and deployed to production (https://smartpos-3beb6.web.app):

| Area | Status | Details |
|------|--------|---------|
| **Monorepo & Tooling** | Done | Turborepo + pnpm, ESLint, TypeScript, Vitest, CI/CD |
| **Shared Package** | Done | Zod schemas, TypeScript types, currency utils (integer cents), tax/discount calculators |
| **Firebase Auth** | Done | Email/password login, PIN login (bcrypt + custom token), custom claims (tenantId, role, branchIds[]) |
| **Firestore Data Model** | Done | Full tenant-scoped schema, security rules, composite indexes |
| **Cloud Functions (13)** | Done | createTransaction, voidTransaction, refundTransaction, openRegister, closeRegister, adjustStock, createUser, assignUserRole, pinLogin, verifyManagerPin + 3 Firestore triggers |
| **POS PWA** | Done | React 19 + Vite + Tailwind CSS, 12 pages, 13 components, 7 services, 5 Zustand stores |
| **Offline Mode** | Done | Firestore persistent cache, offline transaction queuing, auto-sync |
| **Real-time Dashboard** | Done | onSnapshot listeners for live aggregates and transactions |
| **Firebase Deployment** | Done | Cloud Functions, Firestore rules/indexes, Firebase Hosting |
| **Demo Data** | Done | Seed script, 2 users, 1 branch, 2 registers, 16 products, 5 categories |
| **Test Suite** | Done | 61 tests (31 shared + 30 POS), Firestore security rules test suite |

**Completed effort estimate: ~120 hours**

---

## 3. Scope of Remaining Work

### Phase 1 — Core POS Completion

Remaining items to bring the core POS to full production readiness.

| Deliverable | Description | Hours |
|-------------|-------------|-------|
| **Barcode Scanning** | USB/Bluetooth scanner keyboard-wedge support, camera-based scanning via html5-qrcode library, support for UPC-A, UPC-E, EAN-13, EAN-8, Code 128, QR Code | 8 |
| **Thermal Receipt Printing** | ESC/POS protocol via WebUSB, support for Epson/Star Micronics, customizable receipt layout (logo, header/footer, return policy), reprint from history | 10 |
| **Digital Receipts** | Email receipts via SendGrid Cloud Function, SMS via Twilio, receipt template system | 6 |
| **CSV Product Import** | Bulk product import from CSV/Excel, field mapping UI, validation with error report, duplicate detection | 5 |
| **Customer Management** | Customer CRUD (name, phone, email, tax ID, notes), phone lookup at checkout, purchase history query, customer-linked transactions | 8 |
| **Hold/Recall Transactions** | Save in-progress cart to Firestore, recall by cashier/register, multiple held carts per terminal, hold reason/notes | 4 |
| **Cash Drop Recording** | Mid-shift cash removal with amount + reason, manager PIN required, reflected in register close expected cash calculation | 3 |
| **Exchange Transactions** | Return + new sale in single atomic operation, price difference handling, stock restore + deduct | 6 |
| **Gift Receipts** | Receipt format without prices, gift receipt flag on transaction | 2 |
| **E2E Tests (Emulators)** | Playwright tests against Firebase Emulators: full sale flow, register open/close, offline mode, auth flows | 8 |
| **UI Polish & Accessibility** | WCAG 2.1 AA compliance (contrast, keyboard navigation, screen reader), responsive layout for tablets, loading states, error boundaries | 8 |

| | **Phase 1 Subtotal** | **68 hours** |
|---|---|---|

---

### Phase 2 — Inventory Management & Mobile App

Full inventory lifecycle and the Flutter owner dashboard app.

| Deliverable | Description | Hours |
|-------------|-------------|-------|
| **Stock Movement History** | Detailed movement log per product (sales, adjustments, transfers, PO receives), movement types with reason codes, filterable/searchable history | 8 |
| **Inventory Alerts (FCM)** | Low stock push notifications via Firebase Cloud Messaging, configurable reorder points, overstock warnings, expiring stock alerts (batch/expiry tracking) | 6 |
| **Supplier Management** | Supplier CRUD (name, contact, email, phone, payment terms, lead time), supplier notes, supplier performance metrics (avg lead time, fill rate) | 6 |
| **Purchase Orders** | Full PO lifecycle (Draft → Sent → Partially Received → Fully Received → Closed), Cloud Function `receivePurchaseOrder` with atomic stock increment, partial receiving, cost price auto-update, email PO to supplier via SendGrid | 16 |
| **Stock Counts** | Full and cycle count modes (by category/location), count sheet generation, variance report (expected vs counted), Cloud Function `commitStockCount` with manager approval, adjustment logging | 12 |
| **Promotions Engine** | 8 promotion types: percentage, fixed amount, BOGO, bundle pricing, happy hour, loyalty reward, coupon code, category discount. Cloud Function `validatePromotions` (server-side, tamper-proof). Start/end dates, branch-specific, max uses, stacking rules | 16 |
| **Customer Loyalty Program** | Points earned per currency unit (configurable ratio), points redeemable as payment method, tier system (Bronze/Silver/Gold) with tier-specific earn rates, Cloud Function `redeemLoyaltyPoints` | 10 |
| **Flutter Mobile App — Setup** | Flutter 3.22+ project scaffold, Riverpod state management, Firebase SDK integration (Auth, Firestore, FCM, Storage), navigation/routing, theming | 8 |
| **Flutter — Authentication** | Email/password login, PIN login, auto-refresh tokens, role-based navigation, session management | 5 |
| **Flutter — Real-time Dashboard** | Today's snapshot (revenue, transaction count, avg value, top 5 products), live transaction feed via Firestore onSnapshot, branch selector (individual or aggregate), comparison vs yesterday/last week | 10 |
| **Flutter — Inventory Screens** | Product catalog browser, stock levels per branch, stock adjustment UI, supplier list, PO management (create/view/receive), stock count initiation and review | 12 |
| **Flutter — Push Notifications** | FCM token registration, notification channels (refunds, voids, register variance, low stock, daily summary), notification history screen | 6 |
| **Flutter — Reports** | Sales analytics (by time range, payment method, category, cashier), product performance, P&L summary view, export trigger (CSV/PDF via Cloud Function) | 10 |
| **Integration Tests** | Cloud Functions vs Firebase Emulator integration tests, Flutter widget tests, end-to-end mobile flow tests | 10 |

| | **Phase 2 Subtotal** | **135 hours** |
|---|---|---|

---

### Phase 3 — Multi-Branch & Advanced Features

Scaling to multiple store locations with advanced analytics and operational features.

| Deliverable | Description | Hours |
|-------------|-------------|-------|
| **Multi-Branch Management** | Branch CRUD (name, address, phone, operating hours, tax settings), branch-specific receipt customization, branch-specific price overrides, branch selector UI throughout POS and mobile | 10 |
| **Consolidated Reporting** | Aggregate dashboard across all branches, per-branch drill-down, branch comparison mode (side-by-side periods or branches), revenue by branch charts | 8 |
| **Inter-Branch Transfers** | Cloud Functions `transferStock` and `receiveTransfer`, atomic two-branch operation, transfer request/approval workflow, transfer history and tracking | 10 |
| **BigQuery Analytics** | Firestore → BigQuery export (Firebase Extension), BigQuery dataset design for 7-year retention, complex SQL queries (P&L, ABC analysis, trends), scheduled Cloud Function for nightly aggregation and reconciliation | 12 |
| **Advanced Reports** | P&L summary (Revenue − COGS = Gross Profit, margin %), stock valuation (cost + retail), cash flow report (daily cash vs expected), tax report (by rate/type, export-ready), ABC analysis, slow mover identification | 12 |
| **Report Exports** | PDF generation (Cloud Function using PDFKit), CSV export, download via signed Firebase Storage URLs, scheduled email reports | 8 |
| **Product Variants** | Variant system (size, color, etc.), variant-level SKU/barcode/price overrides, variant stock tracking, variant selection in POS cart | 10 |
| **Offline Hardening** | 72-hour offline stress testing, conflict resolution UX (stock conflicts, sync failures), sync queue visibility indicator (pending write count), retry logic and error recovery | 6 |
| **Thermal Printer Advanced** | Multiple printer support, kitchen/bar printer routing, receipt width configuration (58mm/80mm), logo printing, barcode on receipt | 6 |
| **Weighted Items** | Price-per-unit products, scale integration, weight entry at POS | 4 |
| **Performance Optimization** | Cloud Function min instances (eliminate cold starts), Firestore composite index tuning, client-side query caching strategy, bundle size optimization (code splitting) | 6 |

| | **Phase 3 Subtotal** | **92 hours** |
|---|---|---|

---

### Phase 4 — Scale & Integrate

Third-party integrations, AI features, and enterprise readiness.

| Deliverable | Description | Hours |
|-------------|-------------|-------|
| **E-commerce — Shopify** | Shopify webhook integration (product sync, order sync, inventory sync), HMAC signature verification, product mapping UI, real-time stock level push to Shopify | 14 |
| **E-commerce — WooCommerce** | WooCommerce REST API integration (product sync, order sync, inventory sync), webhook listener Cloud Function, product mapping and field mapping, conflict resolution for dual-channel sales | 14 |
| **Accounting — QuickBooks** | QuickBooks Online API integration, OAuth 2.0 flow, daily journal entry push (sales, COGS, tax), chart of accounts mapping, payment method → QB account mapping | 12 |
| **Accounting — Xero** | Xero API integration, OAuth 2.0 flow, invoice/bill creation, bank feed reconciliation, tax code mapping | 12 |
| **Accounting — CSV Export** | Universal CSV export for any accounting system, configurable column mapping, scheduled daily/weekly/monthly exports, download from Firebase Storage | 4 |
| **AI Reorder Suggestions** | Sales velocity analysis (units/day over configurable windows), lead time factoring, seasonal pattern detection, reorder point recommendations with confidence scores, one-click PO generation from suggestions | 12 |
| **AI Sales Forecasting** | Revenue projections from BigQuery history (30/60/90 day), trend analysis (growth rate, seasonality), category-level and product-level forecasts, visualization in mobile app and POS dashboard | 10 |
| **Public REST API** | Cloud Functions as REST endpoints, API key authentication (sk_live_ prefix, SHA-256 hashing), per-key rate limiting, Swagger/OpenAPI documentation, API key management UI (create, revoke, usage stats) | 12 |
| **Audit & Compliance** | Full audit log viewer in mobile app (filters by action, user, date range, entity type), color-coded actions, export-ready formats, GDPR data export endpoint, GDPR data deletion endpoint | 8 |
| **Firebase App Check** | Prevent non-genuine app access, SafetyNet (Android) + DeviceCheck (iOS) + reCAPTCHA v3 (web), enforce in Cloud Functions | 4 |
| **Security Audit** | OWASP Top 10 review, auth bypass testing, tenant isolation verification, input validation audit, rate limiting stress test | 6 |
| **Load Testing** | k6 load testing against staging Firebase, concurrent transaction throughput testing, Cloud Function latency profiling under load, Firestore read/write bottleneck identification | 5 |
| **i18n / Localization** | Internationalization framework setup (POS + mobile), English base, 2+ additional language packs, currency format localization, RTL support preparation | 8 |
| **Onboarding & Tenant Signup** | Self-service tenant signup flow, tenant creation Cloud Function (creates Firestore structure + admin user), welcome email, guided setup wizard (add branch, products, first register) | 10 |

| | **Phase 4 Subtotal** | **131 hours** |
|---|---|---|

---

### Cross-Cutting Concerns

| Deliverable | Description | Hours |
|-------------|-------------|-------|
| **Documentation** | API documentation, deployment guide, user manual (POS + mobile), developer onboarding guide | 8 |
| **CI/CD Refinement** | GitHub Actions: lint, type-check, build, test on PR; auto-deploy to staging on develop merge; auto-deploy to production on main merge; environment-specific Firebase projects | 5 |
| **Monitoring & Alerting** | Sentry (web error tracking), Firebase Crashlytics (mobile), Cloud Monitoring dashboards, uptime checks, error rate alerting | 5 |
| **Bug Fixing & Stabilization** | Post-phase bug fixes, edge case handling, user feedback iterations, production incident response | 16 |

| | **Cross-Cutting Subtotal** | **34 hours** |
|---|---|---|

---

## 4. Effort Summary

| Phase | Description | Status | Hours |
|-------|-------------|--------|-------|
| **Foundation** | Monorepo, Auth, Firebase migration, core POS, deployment | **Complete** | 120 |
| **Phase 1 Remaining** | Barcode, receipts, customers, hold/recall, E2E tests | Pending | 68 |
| **Phase 2** | Inventory, suppliers, POs, promotions, loyalty, Flutter app | Pending | 135 |
| **Phase 3** | Multi-branch, BigQuery, advanced reports, variants, offline hardening | Pending | 92 |
| **Phase 4** | E-commerce, accounting, AI, public API, compliance, i18n | Pending | 131 |
| **Cross-Cutting** | Documentation, CI/CD, monitoring, bug fixes | Ongoing | 34 |
| | | | |
| **Total Completed** | | | **120 hrs** |
| **Total Remaining** | | | **460 hrs** |
| **Grand Total** | | | **580 hrs** |

---

## 5. Pricing

### Option A — Full Project (All Phases)

| Item | Hours | Rate (ZAR/hr) | Amount (ZAR) |
|------|-------|----------------|--------------|
| Completed work (Foundation) | 120 | R650 | R78,000 |
| Phase 1 Remaining | 68 | R650 | R44,200 |
| Phase 2 — Inventory & Mobile | 135 | R650 | R87,750 |
| Phase 3 — Multi-Branch & Advanced | 92 | R650 | R59,800 |
| Phase 4 — Scale & Integrate | 131 | R650 | R85,150 |
| Cross-Cutting | 34 | R650 | R22,100 |
| | | | |
| **Total (all work)** | **580** | | **R377,000** |
| **Remaining balance (unpaid work)** | **460** | | **R299,000** |

### Option B — Phase-by-Phase

| Phase | Hours | Amount (ZAR) | Cumulative |
|-------|-------|--------------|------------|
| Foundation *(completed)* | 120 | R78,000 | R78,000 |
| Phase 1 Completion | 68 | R44,200 | R122,200 |
| Phase 2 — Inventory & Mobile | 135 | R87,750 | R209,950 |
| Phase 3 — Multi-Branch & Advanced | 92 | R59,800 | R269,750 |
| Phase 4 — Scale & Integrate | 131 | R85,150 | R354,900 |
| Cross-Cutting (spread across phases) | 34 | R22,100 | R377,000 |

### Option C — MVP Only (Phase 1 + Phase 2)

Deliver a fully functional POS with inventory management and mobile app.

| Item | Hours | Amount (ZAR) |
|------|-------|--------------|
| Foundation *(completed)* | 120 | R78,000 |
| Phase 1 Completion | 68 | R44,200 |
| Phase 2 | 135 | R87,750 |
| Cross-cutting (proportional) | 12 | R7,800 |
| | | |
| **MVP Total** | **335** | **R217,750** |
| **MVP Remaining** | **215** | **R139,750** |

---

## 6. Recurring Costs (Post-Launch)

### Firebase Infrastructure (per tenant)

| Service | Free Tier | Estimated Monthly Cost (ZAR) |
|---------|-----------|------------------------------|
| Firestore reads | 50K/day free | R10 – R90 |
| Firestore writes | 20K/day free | R20 – R180 |
| Firestore storage | 1 GiB free | R10 |
| Cloud Functions invocations | 2M/month free | R0 – R90 |
| Cloud Functions compute | 400K GB-sec free | R20 – R180 |
| Firebase Auth | 50K MAU free | R0 |
| Firebase Storage | 5 GB free | R0 – R35 |
| Firebase Hosting | 10 GB/month free | R0 |
| **Total per tenant** | | **R90 – R550/month** |

### Third-Party Services

| Service | Purpose | Estimated Cost (ZAR) |
|---------|---------|----------------------|
| SendGrid | Email receipts & PO emails | Free tier: 100 emails/day |
| Twilio | SMS receipts | ~R0.14/SMS |
| Algolia/Typesense | Full-text search (Phase 2+, large catalogs) | R0 – R900/month |
| BigQuery | Advanced analytics (Phase 3+) | R0 – R360/month |
| Vertex AI | AI features (Phase 4) | R0 – R900/month |

### Maintenance & Support (Optional)

| Tier | Coverage | Monthly Cost (ZAR) |
|------|----------|-------------------|
| Basic | Bug fixes, security patches, dependency updates | R5,000/month |
| Standard | Basic + feature requests (up to 20 hrs/month), priority response | R10,000/month |
| Premium | Standard + 24/7 on-call, SLA guarantees, dedicated Slack channel | R18,000/month |

---

## 7. Timeline

| Phase | Duration | Milestone |
|-------|----------|-----------|
| **Phase 1 Completion** | 2–3 weeks | Full POS with barcode scanning, receipts, customers, E2E tested |
| **Phase 2** | 4–5 weeks | Inventory lifecycle, Flutter mobile app (iOS + Android), promotions, loyalty |
| **Phase 3** | 3–4 weeks | Multi-branch operations, BigQuery analytics, advanced reports, variant support |
| **Phase 4** | 4–5 weeks | E-commerce + accounting integrations, AI features, public API, compliance |
| | | |
| **Total remaining** | **13–17 weeks** | **(~3–4 months)** |

*Timeline assumes one senior full-stack developer. Can be compressed with additional developers.*

---

## 8. Technology Stack

| Layer | Technology |
|-------|-----------|
| **POS Frontend** | React 19, TypeScript, Vite 6, Zustand, TanStack Query, Tailwind CSS 4, PWA (Workbox) |
| **Mobile App** | Flutter 3.22+, Dart, Riverpod |
| **Authentication** | Firebase Auth + custom claims |
| **Database** | Cloud Firestore (NoSQL, real-time, offline persistence) |
| **Server Logic** | Cloud Functions v2 (Node.js 22, TypeScript) |
| **File Storage** | Firebase Storage |
| **Push Notifications** | Firebase Cloud Messaging (FCM) |
| **Analytics** | BigQuery (Firestore export) |
| **Email** | SendGrid |
| **SMS** | Twilio |
| **Hosting** | Firebase Hosting (CDN) |
| **CI/CD** | GitHub Actions |
| **Monorepo** | Turborepo + pnpm |
| **Testing** | Vitest, Playwright, Firebase Emulator Suite |
| **Monitoring** | Sentry (web), Firebase Crashlytics (mobile) |

---

## 9. Deliverables per Phase

### Phase 1 Completion
- Barcode scanning component (USB/Bluetooth/camera)
- Thermal receipt printing (ESC/POS via WebUSB)
- Digital receipt system (email + SMS)
- CSV product import with validation
- Customer management module
- Hold/recall transaction feature
- Cash drop recording
- Exchange transaction flow
- E2E test suite (Playwright + Firebase Emulators)
- WCAG 2.1 AA accessibility compliance

### Phase 2
- Full inventory tracking with stock movement history
- FCM push notification integration (low stock, voids, refunds)
- Supplier management module
- Purchase order lifecycle (create → receive → close)
- Stock count system (full + cycle counts with variance)
- Promotions engine (8 types, server-side validated)
- Customer loyalty program (points, tiers, redemption)
- Flutter mobile app (iOS + Android):
  - Authentication (email + PIN)
  - Real-time dashboard with branch selector
  - Inventory management screens
  - Push notification system
  - Reports and analytics views
- Integration test suite

### Phase 3
- Multi-branch management UI
- Consolidated cross-branch reporting
- Inter-branch stock transfer workflow
- BigQuery data pipeline + advanced analytics
- Advanced financial reports (P&L, ABC, stock valuation, tax, cash flow)
- Report export (PDF + CSV)
- Product variant system
- 72-hour offline stress testing
- Advanced thermal printer support
- Performance optimization (cold starts, indexes, code splitting)

### Phase 4
- Shopify integration (product/order/inventory sync)
- WooCommerce integration (product/order/inventory sync)
- QuickBooks Online integration (journal entries, tax)
- Xero integration (invoices, bank feeds)
- Universal CSV accounting export
- AI reorder suggestions (sales velocity + lead time analysis)
- AI sales forecasting (30/60/90 day projections)
- Public REST API with key authentication + Swagger docs
- Audit & compliance viewer (web + mobile)
- Firebase App Check enforcement
- Security audit (OWASP Top 10)
- Load testing (k6)
- Internationalization (i18n) framework + 2 languages
- Self-service tenant onboarding flow

---

## 10. Assumptions & Exclusions

### Assumptions
- Client provides timely feedback (within 3 business days per review cycle)
- Firebase Blaze plan remains active throughout development
- Third-party APIs (SendGrid, Twilio, Shopify, QuickBooks, Xero) remain stable with current pricing
- One senior full-stack developer for timeline estimates
- Hardware (barcode scanners, receipt printers) provided by client for testing
- App Store / Play Store submission handled by client (Flutter app)

### Exclusions
- Hardware procurement (POS terminals, scanners, printers)
- App Store / Play Store developer accounts and submission fees
- Custom hardware integrations beyond standard barcode scanners and ESC/POS printers
- Payment gateway integration (card processing handled by external terminal)
- Custom branding / white-labeling beyond standard theming
- Data migration from existing POS systems
- On-site training (remote training included)
- Language translations (translation files provided by client; framework and tooling included)

---

## 11. Payment Terms

| Milestone | Amount | Trigger |
|-----------|--------|---------|
| Phase 1 Completion | 15% of remaining | Barcode + receipts + customers working in production |
| Phase 2 — Midpoint | 15% of remaining | Inventory + suppliers + POs deployed |
| Phase 2 — Completion | 15% of remaining | Flutter app + promotions + loyalty live |
| Phase 3 — Completion | 20% of remaining | Multi-branch + analytics + reports deployed |
| Phase 4 — Midpoint | 15% of remaining | Integrations (e-commerce + accounting) live |
| Phase 4 — Completion | 20% of remaining | AI + public API + compliance + final delivery |

---

## 12. Warranty & Support

- **30-day warranty** after each phase delivery: bug fixes at no additional cost
- **Source code ownership** transfers to client upon full payment
- **Knowledge transfer** session (2 hours) at project completion
- **Documentation** included: API docs, deployment guide, user manual
- **Optional maintenance contract** available (see Section 6)

---

*This quotation is valid for 60 days from the date of issue.*
