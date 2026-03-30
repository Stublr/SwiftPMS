import type { UserRole } from "../constants/roles.js";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface PinLoginRequest {
  pin: string;
  propertyId: string;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: UserRole;
  propertyIds: string[];
}

export interface FirebaseCustomClaims {
  tenantId: string;
  role: UserRole;
  propertyIds: string[];
}
