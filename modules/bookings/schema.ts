import * as z from "zod";

export const connectorTypes = ["CCS2", "CHAdeMO", "Type2", "Other"] as const;

export const createBookingSchema = z.strictObject({
  vehicleId: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().min(3).max(200),
  batteryPercent: z.number().int().min(0).max(100),
  connectorType: z.enum(connectorTypes),
  targetPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingCursorSchema = z.strictObject({
  cursor: z.iso.datetime().optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export type BookingCursorInput = z.infer<typeof bookingCursorSchema>;
