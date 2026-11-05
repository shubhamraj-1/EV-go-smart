import { createOrder, PaymentError } from "@/modules/payments/service";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/payments/order — create Razorpay order for own completed booking.
 * Body: { bookingId }. Idempotency-Key required; amount computed server-side.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const limit = await checkRateLimit(`payments:order:${actor.userId}`, 10, 60 * 60 * 1000);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many payment requests.", requestId } }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(limit.resetAt.getTime() / 1000)) } },
      );
    }
    const key = request.headers.get("Idempotency-Key");
    if (!key) return errorResponse(requestId, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key required.");
    const body = (await request.json().catch(() => null)) as { bookingId?: string } | null;
    if (!body?.bookingId) return errorResponse(requestId, 400, "INVALID_INPUT", "bookingId is required.");

    const order = await createOrder(actor, body.bookingId, key);
    return Response.json({ order, requestId }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof PaymentError) {
      const map: Record<string, number> = {
        BOOKING_NOT_FOUND: 404,
        FORBIDDEN: 403,
        ALREADY_PAID: 409,
        INVALID_TRANSITION: 409,
        NO_AMOUNT: 409,
      };
      return errorResponse(requestId, map[e.code] ?? 400, e.code, e.message);
    }
    throw e;
  }
}
