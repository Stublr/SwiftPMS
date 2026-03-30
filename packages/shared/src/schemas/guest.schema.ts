import { z } from "zod";

const nullishString = (max: number) =>
  z.string().max(max).nullish().transform((v) => v ?? undefined);

const companionSchema = z.object({
  firstName: z.string().min(1, "First name required").max(255),
  lastName: z.string().min(1, "Last name required").max(255),
  relationship: z.string().min(1, "Relationship required").max(100),
  idType: z.enum(["passport", "id_card", "drivers_license"]).nullish().transform((v) => v ?? null),
  idNumber: z.string().max(100).nullish().transform((v) => v ?? null),
  age: z.number().int().min(0).max(150).nullish().transform((v) => v ?? null),
});

export const createGuestSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(255),
  lastName: z.string().min(1, "Last name is required").max(255),
  email: z.string().email().nullish().transform((v) => v ?? undefined),
  phone: nullishString(50),
  nationality: nullishString(10),
  idType: z.enum(["passport", "id_card", "drivers_license"]).nullish().transform((v) => v ?? undefined),
  idNumber: nullishString(100),
  address: nullishString(500),
  notes: nullishString(1000),
  companions: z.array(companionSchema).nullish().transform((v) => v ?? undefined),
});

export const updateGuestSchema = createGuestSchema.partial();

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
