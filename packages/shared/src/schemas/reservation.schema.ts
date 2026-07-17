import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createReservationSchema = z
  .object({
    guestId: z.string().min(1, "Guest is required"),
    roomTypeId: z.string().min(1, "Room type is required"),
    roomId: z.string().min(1).nullish().transform((v) => v ?? undefined),
    checkInDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    checkOutDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    adults: z.number().int().min(0),
    // nullish: the Firebase callable encoder turns client-side `undefined`
    // into `null`, which .default() alone rejects.
    children: z.number().int().min(0).nullish().transform((v) => v ?? 0),
    /** Pensioners (SA senior citizens, staff-verified). Priced at the tier's extraSenior rate. */
    pensioners: z.number().int().min(0).nullish().transform((v) => v ?? 0),
    specialRequests: z.string().max(1000).nullish().transform((v) => v ?? undefined),
    // Optional client-generated idempotency token to dedupe retries.
    clientRequestId: z
      .string()
      .min(1)
      .max(128)
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .refine(
    (d) => d.checkOutDate > d.checkInDate,
    { message: "Check-out must be after check-in", path: ["checkOutDate"] },
  )
  .refine(
    (d) => (d.adults + (d.pensioners ?? 0) + (d.children ?? 0)) >= 1,
    { message: "At least one person is required", path: ["adults"] },
  );

/**
 * Group booking: N campsites, one folio, one payment. Items may repeat the
 * same roomTypeId (e.g. two Standard Campsites). Guest count is applied
 * per-site — each item gets its own adults/children, so tiered pricing
 * calculates correctly for a mixed group (e.g. 4 adults on site A, 6 on
 * site B). specialRequests, dates, and property are shared across the group.
 */
export const createReservationGroupSchema = z
  .object({
    guestId: z.string().min(1),
    checkInDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    checkOutDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    items: z
      .array(
        z.object({
          roomTypeId: z.string().min(1),
          adults: z.number().int().min(1),
          children: z.number().int().min(0).nullish().transform((v) => v ?? 0),
        }),
      )
      .min(1, "At least one campsite is required")
      .max(10, "Max 10 sites per group booking"),
    specialRequests: z.string().max(1000).nullish().transform((v) => v ?? undefined),
    clientRequestId: z
      .string()
      .min(1)
      .max(128)
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .refine(
    (d) => d.checkOutDate > d.checkInDate,
    { message: "Check-out must be after check-in", path: ["checkOutDate"] },
  );

export type CreateReservationGroupInput = z.infer<typeof createReservationGroupSchema>;

/**
 * Legacy import: staff manually enters a reservation that was originally
 * made on a different system (St Lucia SA's system, Ezemvelo KZN Wildlife,
 * etc.) before the SwiftPMS takeover. The guest arrives with paperwork
 * from the old system; staff captures it so check-in works, the folio
 * balances, and any cash top-up on arrival is tracked properly.
 *
 * Differences from a walk-in:
 *   - Dates may be in the past or future
 *   - Total is TAKEN VERBATIM from the invoice (`totalRoomChargesCents`),
 *     not computed from our tiered pricing — the old operator's rate is
 *     what the guest paid.
 *   - `amountAlreadyPaidCents` applies immediately as a payment on the
 *     folio, so the balance reflects only what's still owing on arrival.
 *   - `externalSource` + `externalReference` preserve the paper trail.
 */
export const createLegacyReservationSchema = z
  .object({
    guestFirstName: z.string().min(1).max(80),
    guestLastName: z.string().min(1).max(80),
    guestEmail: z.string().email().nullish().transform((v) => v ?? undefined),
    guestPhone: z.string().max(40).nullish().transform((v) => v ?? undefined),
    roomTypeId: z.string().min(1),
    checkInDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    checkOutDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    adults: z.number().int().min(0),
    children: z.number().int().min(0).nullish().transform((v) => v ?? 0),
    /** Pensioners in the group (staff-verified). Priced per tier's extraSenior rate. */
    pensioners: z.number().int().min(0).nullish().transform((v) => v ?? 0),
    /** Total from the original invoice (cents). Overrides tiered pricing. */
    totalRoomChargesCents: z.number().int().min(0),
    /** How much has already been paid on the old system (cents). 0 if nothing. */
    amountAlreadyPaidCents: z.number().int().min(0).default(0),
    /** Method used for the original payment (staff picks from list). */
    paymentMethodOriginal: z
      .enum(["cash", "card", "eft", "other"])
      .nullish()
      .transform((v) => v ?? undefined),
    /** Old system's payment reference (invoice #, receipt #, whatever). */
    paymentReference: z.string().max(200).nullish().transform((v) => v ?? undefined),
    /** When the guest originally paid (YYYY-MM-DD). Freeform text if unclear. */
    paymentDateOriginal: z.string().max(40).nullish().transform((v) => v ?? undefined),
    /** Human-readable name of the source system. E.g. "St Lucia SA", "Ezemvelo KZN Wildlife". */
    externalSource: z.string().min(1).max(200),
    /** Original booking reference on that system. E.g. "Ezemvelo #632772". */
    externalReference: z.string().max(200).nullish().transform((v) => v ?? undefined),
    /** Freeform notes — hand-written scrawls on the invoice, arrival instructions, etc. */
    notes: z.string().max(2000).nullish().transform((v) => v ?? undefined),
    clientRequestId: z
      .string()
      .min(1)
      .max(128)
      .nullish()
      .transform((v) => v ?? undefined),
  })
  .refine(
    (d) => d.checkOutDate > d.checkInDate,
    { message: "Check-out must be after check-in", path: ["checkOutDate"] },
  )
  .refine(
    (d) => d.amountAlreadyPaidCents <= d.totalRoomChargesCents,
    {
      message: "Amount paid cannot exceed the invoice total",
      path: ["amountAlreadyPaidCents"],
    },
  );

export type CreateLegacyReservationInput = z.infer<typeof createLegacyReservationSchema>;

export const checkInSchema = z.object({
  reservationId: z.string().min(1),
  roomId: z.string().min(1).nullish().transform((v) => v ?? undefined),
});

export const checkOutSchema = z.object({
  reservationId: z.string().min(1),
});

export const cancelReservationSchema = z.object({
  reservationId: z.string().min(1),
  reason: z.string().max(500).nullish().transform((v) => v ?? undefined),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;
