import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { formatCents } from "@swiftpms/shared";

import { notFound, preconditionFailed, unauthorized, wrapError } from "../lib/errors.js";
import { SENDGRID_API_KEY, sendBookingConfirmation } from "../lib/email.js";
import {
  propertyRef,
  reservationRef,
  roomTypeRef,
  tourOperatorsRef,
} from "../lib/firestore.js";
import { validateRequest } from "../lib/validation.js";

const setReservationClientSchema = z.object({
  propertyId: z.string().min(1),
  reservationId: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).nullish().transform((v) => v ?? undefined),
});

/**
 * A tour operator assigns (or changes) the client a booking was made for.
 * Operator-only, and only on their own reservations. The new client
 * immediately receives the booking-confirmation email for the transaction.
 */
export const setReservationClient = onCall(
  { cors: true, secrets: [SENDGRID_API_KEY] },
  async (request) => {
    try {
      if (!request.auth) throw unauthorized();

      const tenantId = request.auth.token.tenantId as string;
      const data = validateRequest(setReservationClientSchema, request.data);

      // Operator-only capability.
      const operatorEmail = (request.auth.token.email as string | undefined ?? "").toLowerCase();
      const operatorSnap = await tourOperatorsRef(tenantId)
        .where("email", "==", operatorEmail)
        .where("active", "==", true)
        .limit(1)
        .get();
      if (operatorSnap.empty) {
        throw preconditionFailed("Only registered tour operators can assign a client to a booking");
      }

      const resRef = reservationRef(tenantId, data.propertyId, data.reservationId);
      const resSnap = await resRef.get();
      if (!resSnap.exists) throw notFound("Reservation not found");
      const reservation = resSnap.data()!;

      if (reservation.guestId !== request.auth.uid) {
        throw preconditionFailed("You can only assign clients on your own bookings");
      }
      if (reservation.status === "cancelled" || reservation.status === "checked_out") {
        throw preconditionFailed("This booking can no longer be transferred");
      }

      const bookedFor = {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
      };
      await resRef.update({
        bookedFor,
        updatedAt: new Date().toISOString(),
      });

      // Send the client their confirmation for this transaction.
      const [propSnap, rtSnap] = await Promise.all([
        propertyRef(tenantId, data.propertyId).get(),
        roomTypeRef(tenantId, reservation.roomTypeId as string).get(),
      ]);
      const prop = propSnap.data();
      await sendBookingConfirmation({
        to: bookedFor.email,
        guestName: bookedFor.name,
        propertyName: (prop?.name as string) ?? "Our Lodge",
        propertyEmail: (prop?.email as string) ?? undefined,
        propertyPhone: (prop?.phone as string) ?? undefined,
        propertyLogoUrl: (prop?.logoUrl as string | undefined) ?? undefined,
        roomTypeName: (rtSnap.data()?.name as string) ?? "Room",
        roomName: null,
        checkInDate: reservation.checkInDate as string,
        checkOutDate: reservation.checkOutDate as string,
        nightCount: reservation.nightCount as number,
        adults: reservation.adults as number,
        children: (reservation.children as number | undefined) ?? 0,
        totalAmount: formatCents(reservation.totalRoomCharges as number),
        ratePerNight: formatCents(reservation.roomRate as number),
        reservationId: data.reservationId,
        specialRequests: (reservation.specialRequests as string | null) ?? null,
        checkInTime: (prop?.checkInTime as string) ?? "14:00",
        checkOutTime: (prop?.checkOutTime as string) ?? "11:00",
      });

      return { ok: true };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      wrapError(err);
    }
  },
);
