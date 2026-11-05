import * as z from "zod";

export const notificationTypes = [
  "booking.requested",
  "booking.assigned",
  "booking.en_route",
  "booking.arrived",
  "booking.charging",
  "booking.completed",
  "booking.cancelled",
  "booking.payment_updated",
  "payment.receipt",
] as const;

export const createNotificationSchema = z.strictObject({
  userId: z.uuid(),
  type: z.enum(notificationTypes),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
