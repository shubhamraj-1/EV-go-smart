import { statusTransitionSchema } from "@/modules/dispatch/schema";
import { transitionBooking, DispatchError } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/bookings/:id/status — validated state transition.
 * Driver (assigned) walks forward statuses; dispatcher/admin may override
 * (audited). Body: { to, reason? } — reason required for cancelled/failed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = statusTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid status transition payload.");
    }
    const booking = await transitionBooking(actor, id, parsed.data.to, parsed.data.reason);
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
        REASON_REQUIRED: 400,
      };
      const status = e.code === "REASON_REQUIRED" ? 400 : (map[e.code] ?? 400);
      return errorResponse(requestId, status, e.code, e.message);
    }
    throw e;
  }
}
