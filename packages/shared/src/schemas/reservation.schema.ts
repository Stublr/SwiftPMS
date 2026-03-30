import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createReservationSchema = z
  .object({
    guestId: z.string().min(1, "Guest is required"),
    roomTypeId: z.string().min(1, "Room type is required"),
    roomId: z.string().min(1).nullish().transform((v) => v ?? undefined),
    checkInDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    checkOutDate: z.string().regex(dateRegex, "Must be YYYY-MM-DD"),
    adults: z.number().int().min(1, "At least 1 adult"),
    children: z.number().int().min(0).default(0),
    specialRequests: z.string().max(1000).nullish().transform((v) => v ?? undefined),
  })
  .refine(
    (d) => d.checkOutDate > d.checkInDate,
    { message: "Check-out must be after check-in", path: ["checkOutDate"] },
  );

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
