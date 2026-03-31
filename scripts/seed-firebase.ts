/**
 * Seed script for SwiftPMS — creates a demo hotel with rooms, staff, and sample data.
 *
 * Usage:
 *   npx tsx scripts/seed-firebase.ts
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or firebase login
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const { hash } = bcrypt;

const PROJECT_ID = process.env.GCLOUD_PROJECT || "smartpos-3beb6";
const __dirname = dirname(fileURLToPath(import.meta.url));

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ?? resolve(__dirname, "../firebase-admin-key.json");

// If emulator env vars are set, initialize without credentials
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("Using Firebase emulators...");
  initializeApp({ projectId: PROJECT_ID });
} else if (!existsSync(keyPath)) {
  console.error("No service account key found.");
  console.error("   Download one from Firebase Console:");
  console.error("   Project Settings > Service Accounts > Generate new private key");
  console.error("   Save it as: firebase-admin-key.json (in project root)");
  process.exit(1);
} else {
  const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
  initializeApp({
    credential: cert(serviceAccount),
    projectId: PROJECT_ID,
  });
}

const auth = getAuth();
const db = getFirestore();

// --- Configuration ---
const TENANT_ID = "tenant_demo";
const PROPERTY_ID = "property_main";
const ADMIN_EMAIL = "admin@swiftpms.demo";
const ADMIN_PASSWORD = "admin123!";
const ADMIN_PIN = "1234";
const FRONTDESK_EMAIL = "frontdesk@swiftpms.demo";
const FRONTDESK_PASSWORD = "frontdesk123!";
const FRONTDESK_PIN = "5678";

async function seed() {
  console.log("Seeding SwiftPMS demo data...");

  // 1. Create tenant
  console.log("\nCreating tenant...");
  await db.doc(`tenants/${TENANT_ID}`).set({
    name: "Tshukudu Bush Lodge",
    settings: {
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      taxRate: 0.15,
      taxInclusive: true,
    },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 2. Create properties (3 lodges)
  console.log("Creating properties...");
  const lodges = [
    {
      id: PROPERTY_ID,
      name: "Lodge 1 — Bush Camp",
      address: "Tshukudu Game Reserve, Limpopo",
      phone: "+27 14 555 0101",
      email: "lodge1@tshukudu.demo",
      description: "A classic bush camp experience with comfortable tented accommodation, perfect for first-time safari visitors. Affordable rates with all the essentials.",
      imageUrls: ["/images/lodge/tented-camp-interior.jpeg"],
      amenities: ["parking", "bush_walks", "game_drives", "braai"],
    },
    {
      id: "property_lodge2",
      name: "Lodge 2 — River Lodge",
      address: "Tshukudu Game Reserve, Limpopo",
      phone: "+27 14 555 0102",
      email: "lodge2@tshukudu.demo",
      description: "Upper-tier lodge overlooking the river with thatched chalets, private decks, and a rim-flow pool. Ideal for couples and families seeking comfort in the bush.",
      imageUrls: ["/images/lodge/pool-sunset.jpeg"],
      amenities: ["wifi", "pool", "parking", "restaurant", "game_drives", "spa"],
    },
    {
      id: "property_lodge3",
      name: "Lodge 3 — Royal Reserve",
      address: "Tshukudu Game Reserve, Limpopo",
      phone: "+27 14 555 0103",
      email: "lodge3@tshukudu.demo",
      description: "Super-luxury private reserve with exclusive suites, personal butler service, heated plunge pools, and world-class cuisine. The pinnacle of safari living.",
      imageUrls: ["/images/lodge/lodge3-lounge.jpeg"],
      amenities: ["wifi", "pool", "parking", "fine_dining", "butler", "spa", "gym", "private_vehicle", "cellar"],
    },
  ];

  for (const lodge of lodges) {
    const { id, ...data } = lodge;
    await db.doc(`tenants/${TENANT_ID}/properties/${id}`).set({
      ...data,
      checkInTime: "14:00",
      checkOutTime: "11:00",
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 3. Create room types
  console.log("Creating room types...");
  const roomTypes = [
    {
      id: "rt_tented",
      name: "Tented Camp",
      code: "TTC",
      description: "Luxury safari tent with en-suite outdoor bathroom, immersed in the African bush",
      baseRate: 195000, // R1,950.00/night
      maxOccupancy: 2,
      bedConfiguration: "1 King Bed",
      amenities: ["aircon", "outdoor_bath", "bush_view", "minibar"],
      imageUrls: [
        "/images/lodge/tented-camp-interior.jpeg",
        "/images/lodge/tented-camp-bathroom.jpeg",
      ],
      isActive: true,
    },
    {
      id: "rt_chalet",
      name: "Bush Chalet",
      code: "BCH",
      description: "Thatched-roof chalet with mosquito net canopy and private deck overlooking the bush",
      baseRate: 275000, // R2,750.00/night
      maxOccupancy: 3,
      bedConfiguration: "1 King Bed",
      amenities: ["aircon", "wifi", "coffee_machine", "minibar", "private_deck", "bush_view"],
      imageUrls: [
        "/images/lodge/chalet-interior.jpeg",
        "/images/lodge/chalet-exterior.jpeg",
        "/images/lodge/bathroom.jpeg",
      ],
      isActive: true,
    },
    {
      id: "rt_suite",
      name: "Lodge Suite",
      code: "STE",
      description: "Premium suite with private lounge, pool access, and panoramic bushveld views",
      baseRate: 450000, // R4,500.00/night
      maxOccupancy: 4,
      bedConfiguration: "1 King Bed + Daybed",
      amenities: ["aircon", "wifi", "pool", "minibar", "private_deck", "bush_view", "lounge", "coffee_machine"],
      imageUrls: [
        "/images/lodge/lodge-lounge.jpeg",
        "/images/lodge/pool-sunset.jpeg",
      ],
      isActive: true,
    },
  ];

  for (const rt of roomTypes) {
    const { id, ...data } = rt;
    await db.doc(`tenants/${TENANT_ID}/roomTypes/${id}`).set({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 4. Create rooms
  console.log("Creating rooms...");
  const rooms = [
    { id: "room_tent1", roomNumber: "Tent 1 - Kudu", roomTypeId: "rt_tented", floor: 1 },
    { id: "room_tent2", roomNumber: "Tent 2 - Impala", roomTypeId: "rt_tented", floor: 1 },
    { id: "room_tent3", roomNumber: "Tent 3 - Nyala", roomTypeId: "rt_tented", floor: 1 },
    { id: "room_tent4", roomNumber: "Tent 4 - Sable", roomTypeId: "rt_tented", floor: 1 },
    { id: "room_chalet1", roomNumber: "Chalet 1 - Marula", roomTypeId: "rt_chalet", floor: 1 },
    { id: "room_chalet2", roomNumber: "Chalet 2 - Tamboti", roomTypeId: "rt_chalet", floor: 1 },
    { id: "room_chalet3", roomNumber: "Chalet 3 - Leadwood", roomTypeId: "rt_chalet", floor: 1 },
    { id: "room_suite1", roomNumber: "Rhino Suite", roomTypeId: "rt_suite", floor: 1 },
    { id: "room_suite2", roomNumber: "Elephant Suite", roomTypeId: "rt_suite", floor: 1 },
    { id: "room_suite3", roomNumber: "Lion Suite", roomTypeId: "rt_suite", floor: 1 },
  ];

  for (const room of rooms) {
    const { id, ...data } = room;
    await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/rooms/${id}`).set({
      ...data,
      status: "available",
      currentReservationId: null,
      notes: null,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 5. Create admin user
  console.log("Creating admin user...");
  const adminPin = await hash(ADMIN_PIN, 10);
  let adminRecord;
  try {
    adminRecord = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: "Hotel Admin",
    });
  } catch {
    adminRecord = await auth.getUserByEmail(ADMIN_EMAIL);
  }
  await auth.setCustomUserClaims(adminRecord.uid, {
    tenantId: TENANT_ID,
    role: "super_admin",
    propertyIds: [PROPERTY_ID, "property_lodge2", "property_lodge3"],
  });
  await db.doc(`tenants/${TENANT_ID}/users/${adminRecord.uid}`).set({
    email: ADMIN_EMAIL,
    fullName: "Hotel Admin",
    role: "super_admin",
    pinHash: adminPin,
    propertyIds: [PROPERTY_ID, "property_lodge2", "property_lodge3"],
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 6. Create front desk user
  console.log("Creating front desk user...");
  const fdPin = await hash(FRONTDESK_PIN, 10);
  let fdRecord;
  try {
    fdRecord = await auth.createUser({
      email: FRONTDESK_EMAIL,
      password: FRONTDESK_PASSWORD,
      displayName: "Front Desk Staff",
    });
  } catch {
    fdRecord = await auth.getUserByEmail(FRONTDESK_EMAIL);
  }
  await auth.setCustomUserClaims(fdRecord.uid, {
    tenantId: TENANT_ID,
    role: "front_desk",
    propertyIds: [PROPERTY_ID, "property_lodge2", "property_lodge3"],
  });
  await db.doc(`tenants/${TENANT_ID}/users/${fdRecord.uid}`).set({
    email: FRONTDESK_EMAIL,
    fullName: "Front Desk Staff",
    role: "front_desk",
    pinHash: fdPin,
    propertyIds: [PROPERTY_ID, "property_lodge2", "property_lodge3"],
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 7. Create sample guests
  console.log("Creating sample guests...");
  const guests = [
    { id: "guest_1", firstName: "John", lastName: "Smith", email: "john@example.com", phone: "+27 82 555 0001" },
    { id: "guest_2", firstName: "Sarah", lastName: "Johnson", email: "sarah@example.com", phone: "+27 83 555 0002" },
    { id: "guest_3", firstName: "Michael", lastName: "Williams", email: "michael@example.com", phone: "+27 84 555 0003" },
  ];

  for (const guest of guests) {
    const { id, ...data } = guest;
    await db.doc(`tenants/${TENANT_ID}/guests/${id}`).set({
      ...data,
      idType: null,
      idNumber: null,
      nationality: null,
      address: null,
      notes: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // 8. Create sample reservations
  console.log("Creating sample reservations...");
  const today = new Date().toISOString().split("T")[0]!;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]!;
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]!;
  const nextWeekEnd = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0]!;

  // Reservation 1: currently checked in
  const res1Ref = db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/reservations/res_1`);
  await res1Ref.set({
    guestId: "guest_1",
    roomId: "room_chalet1",
    roomTypeId: "rt_chalet",
    checkInDate: today,
    checkOutDate: tomorrow,
    nightCount: 1,
    adults: 2,
    children: 0,
    status: "checked_in",
    roomRate: 195000,
    totalRoomCharges: 195000,
    specialRequests: "Late check-out if possible",
    source: "front_desk",
    createdBy: adminRecord.uid,
    checkedInAt: FieldValue.serverTimestamp(),
    checkedInBy: adminRecord.uid,
    checkedOutAt: null,
    checkedOutBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Update room 201 as occupied
  await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/rooms/room_chalet1`).update({
    status: "occupied",
    currentReservationId: "res_1",
  });

  // Folio for res_1
  await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/folios/folio_1`).set({
    reservationId: "res_1",
    guestId: "guest_1",
    charges: [{
      id: "chg_1",
      category: "room",
      description: "Deluxe Room - 1 night(s)",
      amount: 195000,
      quantity: 1,
      total: 195000,
      date: today,
      addedBy: adminRecord.uid,
      addedAt: new Date().toISOString(),
    }],
    payments: [],
    totalCharges: 195000,
    totalPayments: 0,
    balance: 195000,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Reservation 2: confirmed for next week
  await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/reservations/res_2`).set({
    guestId: "guest_2",
    roomId: null,
    roomTypeId: "rt_suite",
    checkInDate: nextWeek,
    checkOutDate: nextWeekEnd,
    nightCount: 3,
    adults: 2,
    children: 1,
    status: "confirmed",
    roomRate: 350000,
    totalRoomCharges: 1050000,
    specialRequests: "Extra pillows please",
    source: "guest_portal",
    createdBy: "guest:guest_2",
    checkedInAt: null,
    checkedInBy: null,
    checkedOutAt: null,
    checkedOutBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Folio for res_2
  await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/folios/folio_2`).set({
    reservationId: "res_2",
    guestId: "guest_2",
    charges: [{
      id: "chg_2",
      category: "room",
      description: "Executive Suite - 3 night(s)",
      amount: 350000,
      quantity: 3,
      total: 1050000,
      date: nextWeek,
      addedBy: "guest:guest_2",
      addedAt: new Date().toISOString(),
    }],
    payments: [],
    totalCharges: 1050000,
    totalPayments: 0,
    balance: 1050000,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log("\n--- Seed complete! ---");
  console.log(`Tenant: ${TENANT_ID}`);
  console.log(`Property: ${PROPERTY_ID}`);
  console.log(`Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (PIN: ${ADMIN_PIN})`);
  console.log(`Front Desk: ${FRONTDESK_EMAIL} / ${FRONTDESK_PASSWORD} (PIN: ${FRONTDESK_PIN})`);
  console.log(`Rooms: ${rooms.length} (${rooms.map(r => r.roomNumber).join(", ")})`);
  console.log(`Room Types: Standard (R1,250), Deluxe (R1,950), Suite (R3,500)`);
  console.log(`Guests: ${guests.length}`);
  console.log(`Reservations: 2 (1 checked-in, 1 confirmed)`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
