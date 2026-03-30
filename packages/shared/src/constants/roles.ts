export const UserRole = {
  SUPER_ADMIN: "super_admin",
  PROPERTY_MANAGER: "property_manager",
  FRONT_DESK: "front_desk",
  HOUSEKEEPING: "housekeeping",
  AUDITOR: "auditor",
  GUEST: "guest",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ALL_ROLES = Object.values(UserRole);

export const STAFF_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.FRONT_DESK,
  UserRole.HOUSEKEEPING,
  UserRole.AUDITOR,
];

export const MANAGER_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.PROPERTY_MANAGER,
];
