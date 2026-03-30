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

const PROJECT_ID = "smartpos-3beb6";
const __dirname = dirname(fileURLToPath(import.meta.url));

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ?? resolve(__dirname, "../firebase-admin-key.json");

if (!existsSync(keyPath)) {
  console.error("No service account key found.");
  console.error("   Download one from Firebase Console:");
  console.error("   Project Settings > Service Accounts > Generate new private key");
  console.error("   Save it as: firebase-admin-key.json (in project root)");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, "utf8"));
initializeApp({
  credential: cert(serviceAccount),
  projectId: PROJECT_ID,
});

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
    name: "SwiftPMS Demo Hotel",
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

  // 2. Create property
  console.log("Creating property...");
  await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}`).set({
    name: "SwiftPMS Demo Hotel",
    address: "123 Hospitality Ave, Cape Town",
    phone: "+27 21 555 0100",
    email: "info@swiftpms.demo",
    description: "A modern boutique hotel in the heart of Cape Town",
    imageUrls: [],
    amenities: ["wifi", "pool", "parking", "restaurant", "gym", "spa"],
    checkInTime: "14:00",
    checkOutTime: "11:00",
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // 3. Create room types
  console.log("Creating room types...");
  const roomTypes = [
    {
      id: "rt_standard",
      name: "Standard Room",
      code: "STD",
      description: "Comfortable room with all essential amenities",
      baseRate: 125000, // R1,250.00/night
      maxOccupancy: 2,
      bedConfiguration: "1 Queen Bed",
      amenities: ["wifi", "tv", "aircon", "minibar"],
      imageUrls: [],
      isActive: true,
    },
    {
      id: "rt_deluxe",
      name: "Deluxe Room",
      code: "DLX",
      description: "Spacious room with city views and premium amenities",
      baseRate: 195000, // R1,950.00/night
      maxOccupancy: 3,
      bedConfiguration: "1 King Bed",
      amenities: ["wifi", "tv", "aircon", "minibar", "balcony", "coffee_machine"],
      imageUrls: [],
      isActive: true,
    },
    {
      id: "rt_suite",
      name: "Executive Suite",
      code: "STE",
      description: "Luxury suite with separate living area and panoramic views",
      baseRate: 350000, // R3,500.00/night
      maxOccupancy: 4,
      bedConfiguration: "1 King Bed + Sofa Bed",
      amenities: ["wifi", "tv", "aircon", "minibar", "balcony", "coffee_machine", "jacuzzi", "lounge"],
      imageUrls: [],
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
    { id: "room_101", roomNumber: "101", roomTypeId: "rt_standard", floor: 1 },
    { id: "room_102", roomNumber: "102", roomTypeId: "rt_standard", floor: 1 },
    { id: "room_103", roomNumber: "103", roomTypeId: "rt_standard", floor: 1 },
    { id: "room_201", roomNumber: "201", roomTypeId: "rt_deluxe", floor: 2 },
    { id: "room_202", roomNumber: "202", roomTypeId: "rt_deluxe", floor: 2 },
    { id: "room_203", roomNumber: "203", roomTypeId: "rt_deluxe", floor: 2 },
    { id: "room_301", roomNumber: "301", roomTypeId: "rt_suite", floor: 3 },
    { id: "room_302", roomNumber: "302", roomTypeId: "rt_suite", floor: 3 },
    { id: "room_104", roomNumber: "104", roomTypeId: "rt_standard", floor: 1 },
    { id: "room_204", roomNumber: "204", roomTypeId: "rt_deluxe", floor: 2 },
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
    propertyIds: [PROPERTY_ID],
  });
  await db.doc(`tenants/${TENANT_ID}/users/${adminRecord.uid}`).set({
    email: ADMIN_EMAIL,
    fullName: "Hotel Admin",
    role: "super_admin",
    pinHash: adminPin,
    propertyIds: [PROPERTY_ID],
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
    propertyIds: [PROPERTY_ID],
  });
  await db.doc(`tenants/${TENANT_ID}/users/${fdRecord.uid}`).set({
    email: FRONTDESK_EMAIL,
    fullName: "Front Desk Staff",
    role: "front_desk",
    pinHash: fdPin,
    propertyIds: [PROPERTY_ID],
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
    roomId: "room_201",
    roomTypeId: "rt_deluxe",
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
  await db.doc(`tenants/${TENANT_ID}/properties/${PROPERTY_ID}/rooms/room_201`).update({
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
