# SwiftPMS — Development Setup Guide

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | >= 22.0.0 | `node -v` |
| pnpm | >= 9.0.0 | `pnpm -v` |
| Firebase CLI | Latest | `firebase --version` |
| Git | Latest | `git -v` |

> Install pnpm: `npm install -g pnpm@9`
> Install Firebase CLI: `npm install -g firebase-tools`

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  Front Desk App  │     │   Guest Portal   │
│  (React 19)      │     │   (React 19)     │
│  :5173           │     │   :5174          │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └──────────┬─────────────┘
                    │
         ┌──────────▼──────────┐
         │  Firebase Backend   │
         │  Cloud Functions    │
         │  Firestore DB       │
         │  Firebase Auth      │
         └─────────────────────┘
```

| Service | Purpose | Port |
|---------|---------|------|
| Front Desk App | Staff operations (rooms, reservations, billing) | 5173 |
| Guest Portal | Guest booking and account management | 5174 |
| Firebase Auth Emulator | Authentication | 9099 |
| Firestore Emulator | Database | 8080 |
| Functions Emulator | Cloud Functions (API) | 5001 |
| Emulator UI | Firebase dashboard | 4400 |

---

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd SwiftPMS
pnpm install
```

### 2. Configure Environment

**Front Desk App** — copy the example:

```bash
cp apps/frontdesk/.env.example apps/frontdesk/.env
```

Contents (`apps/frontdesk/.env`):

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**Guest Portal** — create `apps/guest/.env`:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_TENANT_ID=tenant_demo
VITE_PROPERTY_ID=property_main
```

**Optional env vars:**

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_GOOGLE_MAPS_API_KEY` | frontdesk `.env` | Enables Google Maps address autocomplete on guest form |
| `RESEND_API_KEY` | Firebase Functions env | Enables booking confirmation emails via Resend |
| `FROM_EMAIL` | Firebase Functions env | Sender email address for transactional emails |

### 3. Build Shared Packages

```bash
pnpm --filter @swiftpms/shared build
```

### 4. Start Firebase Emulators

```bash
pnpm emulators
```

Wait until you see the emulator UI is running at http://127.0.0.1:4400.

### 5. Seed Demo Data

In a **separate terminal**:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/seed-firebase.ts
```

This creates:

| Entity | Details |
|--------|---------|
| Tenant | Tshukudu Bush Lodge |
| Properties | 3 lodges (Bush Camp, River Lodge, Royal Reserve) |
| Room Types | Tented Camp (R1,950), Bush Chalet (R2,750), Lodge Suite (R4,500) |
| Rooms | 10 rooms (4 tents, 3 chalets, 3 suites) |
| Staff | Admin + Front Desk user |
| Guests | 3 sample guests |
| Reservations | 2 (1 checked-in, 1 confirmed) |

### 6. Start Dev Servers

```bash
pnpm dev
```

Or individually:

```bash
pnpm --filter @swiftpms/frontdesk dev   # http://localhost:5173
pnpm --filter @swiftpms/guest dev       # http://localhost:5174
```

### 7. Log In

Open http://localhost:5173 and log in:

| Account | Email | Password | PIN |
|---------|-------|----------|-----|
| Admin | admin@swiftpms.demo | admin123! | 1234 |
| Front Desk | frontdesk@swiftpms.demo | frontdesk123! | 5678 |

Select a property, then you'll see the dashboard.

---

## Verify Everything Works

### Front Desk Flows

1. **Dashboard** — shows occupancy rate, arrivals, departures
2. **Room Board** — 10 rooms with colour-coded statuses
3. **Reservations** — click "Check In" on a confirmed reservation
4. **Guests** — add a guest with country dropdown and companions
5. **Room Setup** — create new room types and rooms

### Guest Portal Flows

1. Open http://localhost:5174
2. Select dates and search
3. Browse available rooms
4. Click "Book Now" — register a guest account
5. Confirm booking — download PDF confirmation
6. View "My Bookings" — download any booking

---

## Project Structure

```
SwiftPMS/
├── apps/
│   ├── frontdesk/                  # Front desk React app
│   │   ├── src/
│   │   │   ├── components/         # Layout, auth components
│   │   │   ├── pages/              # Dashboard, rooms, reservations, guests, reports, admin
│   │   │   ├── services/           # Firebase client services
│   │   │   ├── stores/             # Zustand stores (auth, ui, property, connectivity)
│   │   │   ├── lib/                # Firebase init, realtime listeners, Google Maps
│   │   │   └── app.tsx             # Root component + routing
│   │   └── .env
│   │
│   └── guest/                      # Guest portal React app
│       ├── src/
│       │   ├── components/         # Guest header
│       │   ├── pages/              # Home, rooms, booking, confirmation, my-bookings, login
│       │   ├── services/           # Auth, availability, booking, property
│       │   ├── stores/             # Auth, UI, booking stores
│       │   └── lib/                # Firebase init, booking PDF generator
│       └── .env
│
├── packages/
│   ├── shared/                     # Shared TypeScript package
│   │   └── src/
│   │       ├── types/              # Guest, Room, Reservation, Folio, Property, etc.
│   │       ├── schemas/            # Zod validation schemas
│   │       ├── constants/          # Roles, room status, countries, payment methods
│   │       └── utils/              # Currency (cents), tax, date, booking helpers
│   │
│   ├── functions/                  # Firebase Cloud Functions
│   │   └── src/
│   │       ├── auth/               # createUser, pinLogin, assignUserRole
│   │       ├── reservations/       # createReservation, checkIn, checkOut, cancelReservation
│   │       ├── billing/            # addCharge, processPayment
│   │       ├── rooms/              # updateRoomStatus
│   │       ├── guest/              # createGuestAccount, checkAvailability, createGuestReservation
│   │       ├── triggers/           # onReservationUpdate, releaseExpiredHolds
│   │       └── lib/                # Firestore refs, errors, audit, validation, email
│   │
│   ├── tsconfig/                   # Shared TS configs (base, node, react)
│   └── eslint-config/              # Shared ESLint rules
│
├── firebase/
│   ├── firestore.rules             # Security rules
│   ├── firestore.indexes.json      # Composite indexes
│   └── storage.rules               # Storage security
│
├── scripts/
│   ├── seed-firebase.ts            # Demo data seeder
│   ├── prepare-functions.sh        # Bundle shared package for deploy
│   └── restore-functions.sh        # Cleanup after deploy
│
├── firebase.json                   # Firebase config (hosting, functions, emulators)
├── .firebaserc                     # Firebase project aliases
├── turbo.json                      # Turborepo task config
└── pnpm-workspace.yaml             # Workspace packages
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build entire monorepo |
| `pnpm dev` | Start all dev servers |
| `pnpm emulators` | Start Firebase emulators |
| `pnpm --filter @swiftpms/frontdesk dev` | Front desk dev (port 5173) |
| `pnpm --filter @swiftpms/guest dev` | Guest portal dev (port 5174) |
| `pnpm --filter @swiftpms/shared build` | Build shared package |
| `pnpm --filter @swiftpms/functions build` | Build cloud functions |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm type-check` | TypeScript type check |
| `pnpm clean` | Remove build artifacts + node_modules |

---

## Deploying to Firebase

### 1. Login

```bash
firebase login
```

### 2. Check project

```bash
cat .firebaserc
```

### 3. Build

```bash
pnpm build
```

### 4. Deploy

```bash
firebase deploy                          # Everything
firebase deploy --only functions         # Functions only
firebase deploy --only hosting           # Both hosting targets
firebase deploy --only firestore:rules   # Rules + indexes
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Emulator ports in use | Kill processes: `lsof -ti :9099 :8080 :5001 \| xargs kill -9` |
| "Check-in failed" | Re-seed data — the reservation may already be checked in |
| Build fails after pull | Run `pnpm install` then `pnpm build` |
| Auth token missing | Hard refresh browser (Ctrl+Shift+R) and log in again |
| Guest portal shows no rooms | Check `VITE_TENANT_ID` and `VITE_PROPERTY_ID` in guest `.env` |
| "roomTypeId: Expected string, received null" | Ensure `@swiftpms/shared` schemas use `.nullish()` not `.optional()` |
