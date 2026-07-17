import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const auth = getAuth();

// --- Tenant ---

export function tenantRef(tenantId: string) {
  return db.doc(`tenants/${tenantId}`);
}

// --- Users ---

export function usersRef(tenantId: string) {
  return db.collection(`tenants/${tenantId}/users`);
}

export function userRef(tenantId: string, userId: string) {
  return db.doc(`tenants/${tenantId}/users/${userId}`);
}

// --- Guests ---

export function guestsRef(tenantId: string) {
  return db.collection(`tenants/${tenantId}/guests`);
}

export function guestRef(tenantId: string, guestId: string) {
  return db.doc(`tenants/${tenantId}/guests/${guestId}`);
}

export function tourOperatorsRef(tenantId: string) {
  return tenantRef(tenantId).collection("tourOperators");
}

// --- Room Types ---

export function roomTypesRef(tenantId: string) {
  return db.collection(`tenants/${tenantId}/roomTypes`);
}

export function roomTypeRef(tenantId: string, roomTypeId: string) {
  return db.doc(`tenants/${tenantId}/roomTypes/${roomTypeId}`);
}

// --- Properties ---

export function propertiesRef(tenantId: string) {
  return db.collection(`tenants/${tenantId}/properties`);
}

export function propertyRef(tenantId: string, propertyId: string) {
  return db.doc(`tenants/${tenantId}/properties/${propertyId}`);
}

// --- Rooms (under property) ---

export function roomsRef(tenantId: string, propertyId: string) {
  return db.collection(`tenants/${tenantId}/properties/${propertyId}/rooms`);
}

export function roomRef(tenantId: string, propertyId: string, roomId: string) {
  return db.doc(`tenants/${tenantId}/properties/${propertyId}/rooms/${roomId}`);
}

// --- Reservations (under property) ---

export function reservationsRef(tenantId: string, propertyId: string) {
  return db.collection(`tenants/${tenantId}/properties/${propertyId}/reservations`);
}

export function reservationRef(tenantId: string, propertyId: string, reservationId: string) {
  return db.doc(`tenants/${tenantId}/properties/${propertyId}/reservations/${reservationId}`);
}

// --- Folios (under property) ---

export function foliosRef(tenantId: string, propertyId: string) {
  return db.collection(`tenants/${tenantId}/properties/${propertyId}/folios`);
}

export function folioRef(tenantId: string, propertyId: string, folioId: string) {
  return db.doc(`tenants/${tenantId}/properties/${propertyId}/folios/${folioId}`);
}

// --- Daily Aggregates (under property) ---

export function dailyAggregatesRef(tenantId: string, propertyId: string) {
  return db.collection(`tenants/${tenantId}/properties/${propertyId}/dailyAggregates`);
}

// --- Payment Intents (under property) ---

export function paymentIntentsRef(tenantId: string, propertyId: string) {
  return db.collection(
    `tenants/${tenantId}/properties/${propertyId}/paymentIntents`,
  );
}

export function paymentIntentRef(
  tenantId: string,
  propertyId: string,
  paymentIntentId: string,
) {
  return db.doc(
    `tenants/${tenantId}/properties/${propertyId}/paymentIntents/${paymentIntentId}`,
  );
}

// --- Shifts (under property) — end-of-shift cash-up records ---

export function shiftsRef(tenantId: string, propertyId: string) {
  return db.collection(
    `tenants/${tenantId}/properties/${propertyId}/shifts`,
  );
}

export function shiftRef(
  tenantId: string,
  propertyId: string,
  shiftId: string,
) {
  return db.doc(
    `tenants/${tenantId}/properties/${propertyId}/shifts/${shiftId}`,
  );
}

// --- Audit Log ---

export function auditLogRef(tenantId: string) {
  return db.collection(`tenants/${tenantId}/auditLog`);
}
