import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const pinLoginSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4-6 digits"),
  propertyId: z.string().min(1),
  tenantId: z.string().min(1),
});

export const guestRegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1, "First name is required").max(255),
  lastName: z.string().min(1, "Last name is required").max(255),
  phone: z.string().max(50).nullish().transform((v) => v ?? undefined),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type PinLoginInput = z.infer<typeof pinLoginSchema>;
export type GuestRegisterInput = z.infer<typeof guestRegisterSchema>;
