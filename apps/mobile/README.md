# SmartPOS Mobile — Owner Dashboard

Flutter mobile app for business owners and administrators. Provides real-time sales monitoring, inventory management, analytics, and push notifications across all branches.

> **Status:** Not yet scaffolded. This guide covers prerequisites, project setup, and the planned architecture.

## Features

| Feature | Description |
|---------|-------------|
| Real-Time Dashboard | Live transaction feed, today's revenue/transaction count/average basket, active registers |
| Sales Analytics | Revenue breakdown by payment method, category, branch, cashier, hour; trend charts; period comparison |
| Inventory Management | Stock levels per branch, reorder alerts, manual adjustments, inter-branch transfers, stock counts |
| Purchase Orders | Create POs, email to suppliers, partial receiving, cost price updates |
| Profit & Financial Reports | P&L summary, gross margin by category/branch, stock valuation, tax reports |
| Push Notifications | Refunds above threshold, voids, register over/short, low stock alerts, daily summary |
| Multi-Branch Support | Branch selector, aggregate view, branch-level filtering |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Flutter >= 3.22 |
| State Management | Riverpod |
| Routing | go_router |
| HTTP Client | dio |
| Real-time | socket_io_client (Socket.IO) |
| Local Storage | shared_preferences + sqflite |
| Push Notifications | firebase_messaging |
| Charts | fl_chart |

## Prerequisites

1. **Flutter SDK** >= 3.22 — [Install guide](https://docs.flutter.dev/get-started/install)
2. **Android Studio** (for Android emulator + SDK) — [Download](https://developer.android.com/studio)
3. **Xcode** (macOS only, for iOS simulator) — Install from the Mac App Store
4. **Git**

Verify your setup:

```bash
flutter doctor
```

All checks should pass (or show only optional items missing).

## Project Setup

### 1. Scaffold the Flutter project

From the monorepo root:

```bash
cd apps/mobile

# Create a new Flutter project in the current directory
flutter create . --org com.smartpos --project-name smartpos_mobile
```

This generates the standard Flutter project structure:

```
apps/mobile/
├── android/            # Android platform files
├── ios/                # iOS platform files
├── lib/                # Dart source code
│   └── main.dart       # Entry point
├── test/               # Widget and unit tests
├── pubspec.yaml        # Dependencies
└── README.md           # This file
```

### 2. Install dependencies

Add the core dependencies to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.6.1
  riverpod_annotation: ^2.6.1
  go_router: ^14.8.1
  dio: ^5.7.0
  socket_io_client: ^3.0.2
  shared_preferences: ^2.3.4
  sqflite: ^2.4.1
  fl_chart: ^0.70.2
  firebase_core: ^3.12.1
  firebase_messaging: ^15.2.4
  intl: ^0.19.0
  cached_network_image: ^3.4.1
  flutter_secure_storage: ^9.2.4

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  riverpod_generator: ^2.6.4
  build_runner: ^2.4.14
  json_serializable: ^6.9.4
```

Then install:

```bash
flutter pub get
```

### 3. Configure environment

Create `lib/config/env.dart`:

```dart
class Env {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/v1', // Android emulator -> host
  );

  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'http://10.0.2.2:3000',
  );
}
```

> **Note:** `10.0.2.2` is the Android emulator's alias for the host machine's `localhost`. For iOS simulator, use `localhost` directly. For a physical device, use your machine's local IP address.

### 4. Start the backend

The mobile app connects to the same API as the POS terminal. From the monorepo root:

```bash
# Start infrastructure (Postgres, Redis, MinIO)
docker compose -f docker/docker-compose.yml up -d

# Start the API server
pnpm --filter @smartpos/api dev
```

The API will be available at `http://localhost:3000`.

### 5. Run the app

```bash
cd apps/mobile

# Android
flutter run -d android

# iOS (macOS only)
flutter run -d ios

# With custom API URL (physical device)
flutter run --dart-define=API_BASE_URL=http://192.168.1.100:3000/v1
```

## Planned Architecture

```
lib/
├── main.dart                    # App entry, ProviderScope, MaterialApp.router
├── config/
│   ├── env.dart                 # Environment variables
│   ├── theme.dart               # App theme (colors, typography)
│   └── router.dart              # go_router configuration
├── core/
│   ├── api/
│   │   ├── api_client.dart      # Dio instance with interceptors
│   │   └── api_interceptors.dart # Auth token injection, error handling
│   ├── auth/
│   │   ├── auth_provider.dart   # Riverpod auth state
│   │   ├── auth_repository.dart # Login, refresh, logout API calls
│   │   └── auth_guard.dart      # Route guard for authenticated pages
│   ├── socket/
│   │   └── socket_service.dart  # Socket.IO client (live transactions)
│   └── storage/
│       └── secure_storage.dart  # Token persistence
├── features/
│   ├── dashboard/
│   │   ├── presentation/
│   │   │   ├── dashboard_screen.dart
│   │   │   └── widgets/
│   │   │       ├── revenue_card.dart
│   │   │       ├── live_feed.dart
│   │   │       └── branch_selector.dart
│   │   ├── providers/
│   │   │   └── dashboard_provider.dart
│   │   └── data/
│   │       └── dashboard_repository.dart
│   ├── analytics/
│   │   ├── presentation/
│   │   │   ├── analytics_screen.dart
│   │   │   └── widgets/
│   │   │       ├── revenue_chart.dart
│   │   │       ├── category_breakdown.dart
│   │   │       └── period_comparison.dart
│   │   ├── providers/
│   │   │   └── analytics_provider.dart
│   │   └── data/
│   │       └── analytics_repository.dart
│   ├── inventory/
│   │   ├── presentation/
│   │   │   ├── inventory_screen.dart
│   │   │   ├── product_detail_screen.dart
│   │   │   ├── stock_count_screen.dart
│   │   │   └── widgets/
│   │   │       ├── stock_level_card.dart
│   │   │       └── movement_list.dart
│   │   ├── providers/
│   │   │   └── inventory_provider.dart
│   │   └── data/
│   │       └── inventory_repository.dart
│   ├── purchase_orders/
│   │   ├── presentation/
│   │   │   ├── po_list_screen.dart
│   │   │   └── po_detail_screen.dart
│   │   ├── providers/
│   │   │   └── po_provider.dart
│   │   └── data/
│   │       └── po_repository.dart
│   ├── reports/
│   │   ├── presentation/
│   │   │   ├── reports_screen.dart
│   │   │   └── widgets/
│   │   │       ├── pnl_summary.dart
│   │   │       └── tax_report.dart
│   │   ├── providers/
│   │   │   └── reports_provider.dart
│   │   └── data/
│   │       └── reports_repository.dart
│   ├── branches/
│   │   ├── presentation/
│   │   │   └── branches_screen.dart
│   │   ├── providers/
│   │   │   └── branches_provider.dart
│   │   └── data/
│   │       └── branches_repository.dart
│   └── settings/
│       └── presentation/
│           └── settings_screen.dart
├── shared/
│   ├── models/                  # Dart data classes (mirroring @smartpos/shared types)
│   │   ├── transaction.dart
│   │   ├── product.dart
│   │   ├── branch.dart
│   │   └── user.dart
│   ├── widgets/                 # Reusable UI components
│   │   ├── loading_indicator.dart
│   │   ├── error_view.dart
│   │   ├── money_text.dart
│   │   └── date_range_picker.dart
│   └── utils/
│       ├── money.dart           # Money formatting/parsing (mirrors shared utils)
│       └── date_format.dart
└── l10n/                        # Localization (optional)
    └── app_en.arb
```

### Architecture Principles

- **Feature-first structure**: Each feature is self-contained with its own screens, providers, and data layer
- **Riverpod for state**: `@riverpod` annotations with code generation for type-safe providers
- **Repository pattern**: All API calls go through repository classes, making them testable and mockable
- **go_router**: Declarative routing with auth guards for protected screens
- **Dio interceptors**: Automatic token injection, 401 handling with refresh, and error normalization

## API Endpoints Used

The mobile app consumes the same REST API as the POS terminal (`/v1/*`). Key endpoints:

| Feature | Endpoints |
|---------|-----------|
| Auth | `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout` |
| Dashboard | `GET /v1/reports/daily-summary` |
| Analytics | `GET /v1/reports/sales`, `GET /v1/reports/top-products`, `GET /v1/reports/cashier-performance`, `GET /v1/reports/payment-breakdown` |
| Inventory | `GET /v1/products`, `GET /v1/inventory/levels`, `POST /v1/inventory/adjustments` |
| Branches | `GET /v1/branches`, `GET /v1/branches/:id` |
| Users | `GET /v1/users`, `POST /v1/users`, `PATCH /v1/users/:id` |
| Registers | `GET /v1/registers`, `GET /v1/reports/register-sessions` |

## Real-Time (Socket.IO)

The app connects to the Socket.IO server at `ws://<API_HOST>/ws` for live updates:

```dart
// Connect to branch room
socket = io(Env.socketUrl, {
  'path': '/ws',
  'query': {'branchId': selectedBranchId},
  'transports': ['websocket'],
});

// Listen for live transactions
socket.on('transaction:created', (data) {
  // Update dashboard live feed
});

socket.on('transaction:voided', (data) {
  // Update dashboard
});
```

## Running Tests

```bash
cd apps/mobile

# Run all tests
flutter test

# Run with coverage
flutter test --coverage

# Run a specific test file
flutter test test/features/dashboard/dashboard_test.dart
```

## Building for Release

### Android

```bash
# Build APK
flutter build apk --release --dart-define=API_BASE_URL=https://api.yourserver.com/v1

# Build App Bundle (for Google Play)
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.yourserver.com/v1
```

The APK will be at `build/app/outputs/flutter-apk/app-release.apk`.

### iOS (macOS only)

```bash
# Build for iOS
flutter build ios --release --dart-define=API_BASE_URL=https://api.yourserver.com/v1
```

Then open `ios/Runner.xcworkspace` in Xcode to archive and distribute.

## Environment-Specific Configuration

| Environment | API URL | Socket URL |
|-------------|---------|------------|
| Android Emulator | `http://10.0.2.2:3000/v1` | `http://10.0.2.2:3000` |
| iOS Simulator | `http://localhost:3000/v1` | `http://localhost:3000` |
| Physical Device (LAN) | `http://<your-ip>:3000/v1` | `http://<your-ip>:3000` |
| Production | `https://api.yourserver.com/v1` | `https://api.yourserver.com` |

Pass custom values at build/run time:

```bash
flutter run \
  --dart-define=API_BASE_URL=http://192.168.1.100:3000/v1 \
  --dart-define=SOCKET_URL=http://192.168.1.100:3000
```
