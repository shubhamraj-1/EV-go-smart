import * as z from "zod";

export const verifyPaymentSchema = z.strictObject({
  razorpayPaymentId: z.string().min(1).max(64),
  razorpayOrderId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const webhookSchema = z.looseObject({
  entity: z.literal("event"),
  event: z.string().min(1).max(64),
  payload: z.looseObject({}),
});
