import { z } from "zod";

export const createRoomTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  code: z.string().min(1, "Code is required").max(20),
  description: z.string().max(1000).nullish().transform((v) => v ?? undefined),
  baseRate: z.number().int().min(0, "Rate must be non-negative"),
  maxOccupancy: z.number().int().min(1, "At least 1 occupant"),
  bedConfiguration: z.string().min(1, "Bed configuration is required").max(255),
  amenities: z.array(z.string()).nullish().transform((v) => v ?? undefined),
});

export const updateRoomTypeSchema = createRoomTypeSchema.partial().extend({
  isActive: z.boolean().nullish().transform((v) => v ?? undefined),
});

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;
