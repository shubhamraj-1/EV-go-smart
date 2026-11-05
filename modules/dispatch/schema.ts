import * as z from "zod";

import { connectorTypes } from "@/modules/bookings/schema";

export const driverStatusSchema = z.strictObject({
  online: z.boolean(),
});

export type DriverStatusInput = z.infer<typeof driverStatusSchema>;

export const statusTransitionSchema = z.strictObject({
  to: z.enum([
    "requested",
    "assigned",
    "en_route",
    "arrived",
    "charging",
    "completed",
    "cancelled",
    "expired",
    "failed",
  ]),
  /** Required for cancelled/failed/manual overrides. */
  reason: z.string().trim().max(500).optional(),
});

export type StatusTransitionInput = z.infer<typeof statusTransitionSchema>;

export const assignSchema = z.strictObject({
  vanId: z.uuid(),
});

export type AssignInput = z.infer<typeof assignSchema>;

export const locationPingSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().int().min(0).max(359).optional(),
});

export type LocationPingInput = z.infer<typeof locationPingSchema>;

/** POST /bookings/[id]/complete — delivered kWh + final amount (computed server-side). */
export const completeSchema = z.strictObject({
  deliveredKwh: z.number().positive().max(500),
});

export type CompleteInput = z.infer<typeof completeSchema>;

export { connectorTypes };
