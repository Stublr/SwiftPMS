import { z } from "zod";

import { ChargeCategory } from "../constants/charge-category.js";
import { PaymentMethod } from "../constants/payment-methods.js";

const chargeCategoryValues = Object.values(ChargeCategory) as [string, ...string[]];
const paymentMethodValues = Object.values(PaymentMethod) as [string, ...string[]];

// Optional client-generated idempotency token. Servers dedupe by this so
// network retries / double-clicks don't double-write.
const clientRequestId = z
  .string()
  .min(1)
  .max(128)
  .nullish()
  .transform((v) => v ?? undefined);

export const addChargeSchema = z.object({
  folioId: z.string().min(1),
  category: z.enum(chargeCategoryValues),
  description: z.string().min(1, "Description is required").max(255),
  amount: z.number().int().min(0, "Amount must be non-negative"),
  quantity: z.number().int().min(1, "At least 1"),
  clientRequestId,
});

export const processPaymentSchema = z.object({
  folioId: z.string().min(1),
  method: z.enum(paymentMethodValues),
  amount: z.number().int().min(1, "Amount must be positive"),
  reference: z.string().max(255).nullish().transform((v) => v ?? undefined),
  clientRequestId,
});

export type AddChargeInput = z.infer<typeof addChargeSchema>;
export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
