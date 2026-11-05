import { getMyBooking } from "@/modules/bookings/service";
import { getBookingForActor } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const { id } = await params;
    // Phase 2A: any actor who can read the booking (owner / assigned driver / ops)
    // gets the dispatch-scoped DTO; customers keep the original owner-scoped read.
    const scoped = await getBookingForActor(actor, id);
    if (!scoped) return errorResponse(requestId, 404, "BOOKING_NOT_FOUND", "Booking not found.");
    const booking = await getMyBooking(actor, id).catch(() => null);
    // Return the original customer DTO when it exists, else the dispatch DTO.
    return Response.json({ booking: booking ?? scoped, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
