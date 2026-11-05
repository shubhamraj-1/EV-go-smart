import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/modules/auth/service";
import { PaymentError, verifyCheckoutSignature } from "@/modules/payments/service";
import { verifyPaymentSchema } from "@/modules/payments/schema";

/**
 * POST /api/v1/payments/verify — server-side signature verification + amount/order checks.
 * Delegates to the payments module (Zod-validated, rate-limited via route caller if any).
 * Webhook remains the source of truth; this is the fast path after Checkout.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const limit = await checkRateLimit(`payments:verify:${actor.userId}`, 20, 60 * 60 * 1000);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many verify attempts.", requestId } }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(limit.resetAt.getTime() / 1000)) } },
      );
    }
    const body = await request.json().catch(() => null);
    const parsed = verifyPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "razorpayPaymentId, razorpayOrderId, razorpaySignature required.");
    }
    const result = await verifyCheckoutSignature(actor, {
      razorpayPaymentId: parsed.data.razorpayPaymentId,
      razorpayOrderId: parsed.data.razorpayOrderId,
      razorpaySignature: parsed.data.razorpaySignature,
    });
    return Response.json({ bookingId: result.bookingId, paymentStatus: result.paymentStatus, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof PaymentError) {
      const map: Record<string, number> = {
        INVALID_SIGNATURE: 400,
        ORDER_NOT_FOUND: 404,
        FORBIDDEN: 403,
        AMOUNT_MISMATCH: 400,
      };
      return errorResponse(requestId, map[e.code] ?? 400, e.code, e.message);
    }
    throw e;
  }
}
