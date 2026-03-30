import { z } from "zod";

import { UserRole } from "../constants/roles.js";

const roleValues = Object.values(UserRole) as [string, ...string[]];

export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required").max(255),
  role: z.enum(roleValues),
  pin: z
    .string()
    .regex(/^\d{4,6}$/, "PIN must be 4-6 digits")
    .nullish()
    .transform((v) => v ?? undefined),
  propertyIds: z.array(z.string().min(1)).min(1, "At least one property is required"),
});

export const updateUserSchema = z.object({
  email: z.string().email().nullish().transform((v) => v ?? undefined),
  fullName: z.string().min(1).max(255).nullish().transform((v) => v ?? undefined),
  role: z.enum(roleValues).nullish().transform((v) => v ?? undefined),
  isActive: z.boolean().nullish().transform((v) => v ?? undefined),
  propertyIds: z.array(z.string().min(1)).nullish().transform((v) => v ?? undefined),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
