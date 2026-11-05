import { createBookingSchema } from "@/modules/bookings/schema";
import { createBooking, listMyBookings, listOpsQueue } from "@/modules/bookings/service";
import { autoAssign, DispatchError } from "@/modules/dispatch/service";
import { publishBookingEvent } from "@/modules/realtime/publish";
import { errorResponse } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireSession } from "@/modules/auth/service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : 20;
    if (limitParam && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid limit.");
    }

    if (actor.role === "dispatcher" || actor.role === "admin") {
      const items = await listOpsQueue();
      return Response.json({ bookings: items, requestId });
    }

    const page = await listMyBookings(actor, cursor, limit);
    return Response.json({ ...page, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "customer" && actor.role !== "admin") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only customers can request a charge.");
    }

    // Rate limits: 5/hour/customer and 20/day/customer (docs/ARCHITECTURE.md).
    const hourWindow = 60 * 60 * 1000;
    const dayWindow = 24 * 60 * 60 * 1000;
    const hourLimit = await checkRateLimit(
      `bookings:hour:${actor.userId}`,
      5,
      hourWindow,
    );
    if (!hourLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again later.",
            requestId,
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(hourLimit.resetAt.getTime() / 1000)),
          },
        },
      );
    }
    const dayLimit = await checkRateLimit(`bookings:day:${actor.userId}`, 20, dayWindow);
    if (!dayLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again later.",
            requestId,
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(dayLimit.resetAt.getTime() / 1000)),
          },
        },
      );
    }

    const key = request.headers.get("Idempotency-Key");
    if (!key) {
      return errorResponse(requestId, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header required.");
    }

    const body = await request.json().catch(() => null);
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid booking data.");
    }

    try {
      const booking = await createBooking(actor, parsed.data, key);
      // Phase 2A: attempt auto-dispatch on creation; failure is non-fatal
      // (booking stays requested; dispatcher sees an exception).
      // We need the full row for dispatch; the DTO carries the id.
      const lease = await autoAssign(actor, booking.id)
        .then((l) => l)
        .catch((e: unknown) => {
          if (e instanceof DispatchError && e.code === "INVALID_TRANSITION") return null;
          return null;
        });
      if (lease) {
        // Best-effort realtime; never blocks the response.
        publishBookingEvent(
          lease.booking.id,
          {
            type: "booking.assigned",
            bookingId: lease.booking.id,
            driverId: lease.booking.driverId,
            vanId: lease.booking.vanId,
            etaMinutes: lease.etaMinutes,
          },
          { driverId: lease.booking.driverId, vanId: lease.booking.vanId, queue: true },
        ).catch(() => undefined);
      } else {
        publishBookingEvent(
          booking.id,
          { type: "booking.created", bookingId: booking.id },
          { queue: true },
        ).catch(() => undefined);
      }
      return Response.json(
        { booking: { ...booking, status: lease?.booking.status ?? booking.status }, requestId },
        { status: 201 },
      );
    } catch (e) {
      if (e instanceof Error && e.message === "VEHICLE_NOT_FOUND") {
        return errorResponse(requestId, 404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
