import { acceptBooking, DispatchError } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/bookings/:id/accept — assigned driver accepts within 60s.
 * Role: driver (assigned).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "driver") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only the assigned driver can accept.");
    }
    const { id } = await params;
    const booking = await acceptBooking(actor, id);
    return Response.json({ booking: booking.id, status: booking.status, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof DispatchError) {
      const map: Record<string, number> = {
        BOOKING_NOT_FOUND: 404,
        FORBIDDEN: 403,
        INVALID_TRANSITION: 409,
        ACCEPT_WINDOW_EXPIRED: 409,
      };
      const status = map[e.code] ?? 400;
      return errorResponse(requestId, status, e.code, e.message);
    }
    throw e;
  }
}
