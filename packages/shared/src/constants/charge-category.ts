export const ChargeCategory = {
  ROOM: "room",
  SERVICE: "service",
  FOOD: "food",
  MINIBAR: "minibar",
  LAUNDRY: "laundry",
  OTHER: "other",
} as const;

export type ChargeCategory =
  (typeof ChargeCategory)[keyof typeof ChargeCategory];
