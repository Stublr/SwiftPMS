import type { UserRole } from "../constants/roles.js";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  pin?: string;
  propertyIds: string[];
}

export interface UpdateUserRequest {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
  propertyIds?: string[];
}
