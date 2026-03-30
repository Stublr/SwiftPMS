export const RoomStatus = {
  AVAILABLE: "available",
  OCCUPIED: "occupied",
  RESERVED: "reserved",
  MAINTENANCE: "maintenance",
  DIRTY: "dirty",
} as const;

export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];
