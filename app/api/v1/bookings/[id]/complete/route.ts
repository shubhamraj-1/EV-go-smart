import { completeSchema } from "@/modules/dispatch/schema";
import { completeBooking, DispatchError } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/bookings/:id/complete — assigned driver completes (`charging -> completed`).
 * Delivered kWh validated against van capacity; final amount computed server-side
 * from the booking's frozen pricing snapshot (no client amount trusted).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "driver") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only the assigned driver can complete.");
    }
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "deliveredKwh (positive) is required.");
    }
    const booking = await completeBooking(actor, id, parsed.data);
    return Response.json({ booking: booking.id, status: booking.status, finalTotalPaise: booking.finalTotalPaise, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof DispatchError) {
      const map: Record<string, number> = {
        BOOKING_NOT_FOUND: 404,
        FORBIDDEN: 403,
        INVALID_TRANSITION: 409,
        EXCEEDS_CAPACITY: 400,
        INVALID_INPUT: 400,
      };
      const status = map[e.code] ?? 400;
      return errorResponse(requestId, status, e.code, e.message);
    }
    throw e;
  }
}
