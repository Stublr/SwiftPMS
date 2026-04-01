# SwiftPMS — Test Credentials

## Local Development URLs

| App | URL |
|-----|-----|
| Front Desk (staff) | http://localhost:5173 |
| Guest Portal | http://localhost:5174 |
| Firebase Emulator UI | http://127.0.0.1:4400 |

## Staff Accounts

| Role | Email | Password | PIN |
|------|-------|----------|-----|
| Super Admin | admin@swiftpms.demo | admin123! | 1234 |
| Front Desk | frontdesk@swiftpms.demo | frontdesk123! | 5678 |

## Demo Data (after seeding)

| Entity | Details |
|--------|---------|
| Tenant | Tshukudu Bush Lodge |
| Properties | Lodge 1 (Bush Camp), Lodge 2 (River Lodge), Lodge 3 (Royal Reserve) |
| Room Types | Tented Camp (R1,950/night), Bush Chalet (R2,750/night), Lodge Suite (R4,500/night) |
| Rooms | 10 total — 4 tents, 3 chalets, 3 suites |
| Guests | John Smith, Sarah Johnson, Michael Williams |
| Reservations | 1 checked-in (room Chalet 1), 1 confirmed (future) |

## Seed Command

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx tsx scripts/seed-firebase.ts
```
