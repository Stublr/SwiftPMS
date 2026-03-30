import { z } from "zod";

import { RoomStatus } from "../constants/room-status.js";

const roomStatusValues = Object.values(RoomStatus) as [string, ...string[]];

export const createRoomSchema = z.object({
  roomNumber: z.string().min(1, "Room number is required").max(20),
  roomTypeId: z.string().min(1, "Room type is required"),
  floor: z.number().int().min(0),
  notes: z.string().max(500).nullish().transform((v) => v ?? undefined),
});

export const updateRoomSchema = z.object({
  roomNumber: z.string().min(1).max(20).nullish().transform((v) => v ?? undefined),
  roomTypeId: z.string().min(1).nullish().transform((v) => v ?? undefined),
  floor: z.number().int().min(0).nullish().transform((v) => v ?? undefined),
  notes: z.string().max(500).nullish().transform((v) => v ?? undefined),
  isActive: z.boolean().nullish().transform((v) => v ?? undefined),
});

export const updateRoomStatusSchema = z.object({
  roomId: z.string().min(1),
  status: z.enum(roomStatusValues),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type UpdateRoomStatusInput = z.infer<typeof updateRoomStatusSchema>;
