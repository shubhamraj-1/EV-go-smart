import { cancelByCustomer } from "@/modules/dispatch/service";
import { DispatchError } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/bookings/:id/cancel — customer self-cancel of own booking
 * (before charging). Dispatcher/admin cancels go through /status or /submit
 * cancel paths with audit. Body: { reason?: string }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const { id } = await params;
    if (actor.role !== "customer" && actor.role !== "admin" && actor.role !== "dispatcher") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only the customer can cancel their own booking here.");
    }
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : undefined;

    const booking = await cancelByCustomer(actor, id, reason);
    return Response.json({ booking: booking.id, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof DispatchError) {
      const map: Record<string, number> = {
        BOOKING_NOT_FOUND: 404,
        FORBIDDEN: 403,
        INVALID_TRANSITION: 409,
      };
      const status = map[e.code] ?? 400;
      return errorResponse(requestId, status, e.code, e.message);
    }
    throw e;
  }
}
