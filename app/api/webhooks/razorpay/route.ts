import { errorResponse } from "@/lib/errors";
import { PaymentError, handleWebhook } from "@/modules/payments/service";
import { webhookSchema } from "@/modules/payments/schema";
import crypto from "crypto";

/**
 * POST /api/webhooks/razorpay — signed webhook. Source of truth for payment
 * capture. Verifies HMAC on the RAW body, idempotency via webhook_events.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const signature = request.headers.get("X-Razorpay-Signature");
  const rawBody = await request.text();
  try {
    const parsed = webhookSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid webhook payload.");
    }
    const eventId = (parsed.data as { id?: string }).id;
    if (!eventId) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Missing event id.");
    }
    const result = await handleWebhook(rawBody, signature, eventId, parsed.data.event);
    return Response.json({ status: result.status, requestId });
  } catch (e) {
    if (e instanceof PaymentError) {
      return errorResponse(requestId, 400, e.code, e.message);
    }
    if (e instanceof SyntaxError) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid JSON.");
    }
    throw e;
  }
}
