import { z } from "zod";
import { PaymentIntentPurpose } from "../constants/payment-intent-status.js";

export const initiatePeachCheckoutRequestSchema = z.object({
  purpose: z.enum([
    PaymentIntentPurpose.GUEST_BOOKING,
    PaymentIntentPurpose.FOLIO_SETTLEMENT,
    PaymentIntentPurpose.CARD_ON_ARRIVAL_PREAUTH,
  ]),
  amount: z.number().int().positive(),
  reservationId: z.string().min(1).optional(),
  folioId: z.string().min(1).optional(),
  paymentType: z.enum(["DB", "PA"]).optional().default("DB"),
  shopperResultUrl: z.string().url(),
});

export type InitiatePeachCheckoutInput = z.infer<
  typeof initiatePeachCheckoutRequestSchema
>;
