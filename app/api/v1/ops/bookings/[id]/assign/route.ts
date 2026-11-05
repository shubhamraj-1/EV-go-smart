import { assignSchema } from "@/modules/dispatch/schema";
import { manualAssign, autoAssign, DispatchError } from "@/modules/dispatch/service";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/ops/bookings/:id/assign — dispatcher console assign.
 * Body: { vanId } for manual, or { vanId: "auto" } for auto-dispatch.
 * Audited; atomic van claim.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "dispatcher" && actor.role !== "admin") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only dispatchers or admins can assign.");
    }
    const limit = await checkRateLimit(`admin:mut:${actor.userId}`, 60, 60 * 60 * 1000);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again later.", requestId } }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(limit.resetAt.getTime() / 1000)) } },
      );
    }
    const { id } = await params;
    const body = await request.json().catch(() => null);

    if (body?.vanId === "auto") {
      const lease = await autoAssign(actor, id);
      if (!lease) {
        return errorResponse(requestId, 409, "NO_VAN_AVAILABLE", "No matching van is available.");
      }
      return Response.json({ booking: lease.booking.id, status: lease.booking.status, vanId: lease.van.id, etaMinutes: lease.etaMinutes, requestId });
    }

    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "vanId (uuid) or \"auto\" is required.");
    }
    const booking = await manualAssign(actor, id, parsed.data.vanId);
    return Response.json({ booking: booking.id, status: booking.status, vanId: booking.vanId, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof DispatchError) {
      const map: Record<string, number> = {
        BOOKING_NOT_FOUND: 404,
        VAN_NOT_FOUND: 404,
        FORBIDDEN: 403,
        VAN_UNAVAILABLE: 409,
        INVALID_TRANSITION: 409,
      };
      return errorResponse(requestId, map[e.code] ?? 400, e.code, e.message);
    }
    throw e;
  }
}
