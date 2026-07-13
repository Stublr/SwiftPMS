import { z } from "zod";

const pricingTierSchema = z.object({
  baseRate: z.number().int().min(0),
  basePersonCount: z.number().int().min(1),
  extraAdult: z.number().int().min(0),
  extraChild: z.number().int().min(0),
  // Optional pensioner (senior) per-person rate. Must be declared here or Zod
  // strips it on validated writes, leaving calculateTieredNightlyRate to fall
  // back to the adult rate and silently overcharging seniors. Optional so it's
  // backwards-compatible with existing room types that never set it.
  extraSenior: z.number().int().min(0).optional(),
});

const peakRangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export const tieredPricingSchema = z.object({
  childAgeMax: z.number().int().min(0).max(17),
  standard: pricingTierSchema,
  high: pricingTierSchema,
  peakRanges: z.array(peakRangeSchema),
});

export const createRoomTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  code: z.string().min(1, "Code is required").max(20),
  description: z.string().max(1000).nullish().transform((v) => v ?? undefined),
  baseRate: z.number().int().min(0, "Rate must be non-negative"),
  tieredPricing: tieredPricingSchema.nullish().transform((v) => v ?? undefined),
  maxOccupancy: z.number().int().min(1, "At least 1 occupant"),
  bedConfiguration: z.string().min(1, "Bed configuration is required").max(255),
  amenities: z.array(z.string()).nullish().transform((v) => v ?? undefined),
});

export const updateRoomTypeSchema = createRoomTypeSchema.partial().extend({
  isActive: z.boolean().nullish().transform((v) => v ?? undefined),
});

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;
