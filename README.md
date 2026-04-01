# SwiftPMS

Lightweight cloud-based Hotel Property Management System with a front desk staff app and guest booking portal.

## Architecture

```
swiftpms/
├── apps/
│   ├── frontdesk/    # React 19 — Front desk staff app
│   └── guest/        # React 19 — Guest booking portal
├── packages/
│   ├── shared/       # Zod schemas, TypeScript types, constants, utilities
│   ├── functions/    # Firebase Cloud Functions (backend API)
│   ├── eslint-config/
│   └── tsconfig/
├── firebase/         # Firestore rules, indexes, storage rules
└── scripts/          # Seed script, deploy helpers
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm 9 |
| Backend | Firebase Cloud Functions v2 (Node 22) |
| Database | Cloud Firestore (multi-tenant, path-based isolation) |
| Auth | Firebase Auth (email/password + PIN for staff, full accounts for guests) |
| Front Desk App | React 19, Vite 6, Zustand 5, Tailwind CSS 4 |
| Guest Portal | React 19, Vite 6, Zustand 5, Tailwind CSS 4 |
| Email | Resend (when API key configured) |
| Hosting | Firebase Hosting (two targets: frontdesk + guest) |

## Prerequisites

- **Node.js** >= 22 ([download](https://nodejs.org))
- **pnpm** >= 9 (`npm install -g pnpm@9`)
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Git**

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/HendrikPlankton/SwiftPMS.git
cd SwiftPMS
pnpm install
```

### 2. Configure environment

Copy the example for the front desk app:

```bash
cp apps/frontdesk/.env.example apps/frontdesk/.env
```

Create `apps/guest/.env` for the guest portal:

```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_TENANT_ID=tenant_demo
VITE_PROPERTY_ID=property_main
```

Optional: `VITE_GOOGLE_MAPS_API_KEY=your_key` for address autocomplete on the guest form.

### 3. Start Firebase emulators

```bash
pnpm emulators
```

Starts Auth (9099), Firestore (8080), Functions (5001), and Emulator UI (4400).

### 4. Seed demo data

In a separate terminal:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/seed-firebase.ts
```

### 5. Start development servers

```bash
pnpm dev
```

| App | URL | Description |
|-----|-----|-------------|
| Front Desk | http://localhost:5173 | Staff operations |
| Guest Portal | http://localhost:5174 | Guest bookings |
| Emulator UI | http://127.0.0.1:4400 | Firebase dashboard |

Start individually:

```bash
pnpm --filter @swiftpms/frontdesk dev   # Front desk only
pnpm --filter @swiftpms/guest dev       # Guest portal only
```

## Demo Credentials

| Role | Email | Password | PIN |
|------|-------|----------|-----|
| Super Admin | admin@swiftpms.demo | admin123! | 1234 |
| Front Desk | frontdesk@swiftpms.demo | frontdesk123! | 5678 |

## Front Desk App

Staff app at http://localhost:5173 for managing hotel operations.

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Occupancy, arrivals/departures, revenue, room status |
| Room Board | `/rooms` | Visual room grid colour-coded by status |
| Reservations | `/reservations` | Create, check-in, check-out, cancel reservations |
| Guests | `/guests` | Guest directory with country dropdown, phone prefix, companions |
| Reports | `/reports` | Occupancy and revenue reports |
| Room Setup | `/admin/rooms` | Room types and individual rooms |
| Properties | `/admin/properties` | Hotel property management |
| Staff | `/admin/users` | User management and roles |

## Guest Portal

Booking portal at http://localhost:5174 for guests.

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Search by dates, lodge cards |
| Rooms | `/rooms` | Available room types with pricing |
| Booking | `/booking` | Book a room, create account |
| Confirmation | `/confirmation` | Success + PDF download |
| My Bookings | `/my-bookings` | View bookings + download confirmations |
| Login | `/login` | Guest login/register |

## Cloud Functions

| Category | Functions |
|----------|----------|
| Auth | createUser, pinLogin, assignUserRole |
| Reservations | createReservation, cancelReservation, checkIn, checkOut |
| Billing | addCharge, processPayment |
| Rooms | updateRoomStatus |
| Guest Portal | createGuestAccount, checkAvailability, createGuestReservation |
| Triggers | onReservationUpdate, releaseExpiredHolds |

## Firestore Data Model

```
tenants/{tenantId}/
  users/{userId}
  guests/{guestId}          — includes companions[] array
  roomTypes/{roomTypeId}
  auditLog/{logId}
  properties/{propertyId}/
    rooms/{roomId}
    reservations/{reservationId}
    folios/{folioId}
    dailyAggregates/{date}
```

## Commands

```bash
pnpm dev                                 # Start all dev servers
pnpm build                               # Build monorepo
pnpm emulators                           # Start Firebase emulators
pnpm --filter @swiftpms/frontdesk dev    # Front desk only
pnpm --filter @swiftpms/guest dev        # Guest portal only
pnpm --filter @swiftpms/shared build     # Build shared package
pnpm --filter @swiftpms/functions build  # Build cloud functions
pnpm clean                               # Remove build artifacts
```

## Deploy

```bash
firebase deploy                          # Deploy everything
firebase deploy --only functions         # Functions only
firebase deploy --only hosting           # Both hosting targets
firebase deploy --only firestore:rules   # Firestore rules
```

## License

Private - All rights reserved.
