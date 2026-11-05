import { locationPingSchema } from "@/modules/dispatch/schema";
import { recordLocationPing, DispatchError } from "@/modules/dispatch/service";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/driver/location — validated GPS ping for the assigned van.
 * Rate limited to 12/min/driver (~1 per 5s) per docs/SECURITY.md.
 * Never logs precise coordinates.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "driver") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only the assigned driver can publish location.");
    }
    const limit = await checkRateLimit(`driver:location:${actor.userId}`, 12, 60 * 1000);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Location updates too frequent.", requestId } }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(limit.resetAt.getTime() / 1000)) } },
      );
    }
    const body = await request.json().catch(() => null);
    const parsed = locationPingSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "lat/lng (numbers in range) are required.");
    }
    const { lat, lng } = parsed.data;
    if (lat === 0 && lng === 0) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid coordinates.");
    }
    const ping = await recordLocationPing(actor, parsed.data);
    return Response.json({ pingId: ping.id, createdAt: ping.createdAt, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof DispatchError) {
      const map: Record<string, number> = {
        NO_ACTIVE_VAN: 409,
        NO_ACTIVE_JOB: 409,
        DRIVER_PROFILE_NOT_FOUND: 404,
      };
      return errorResponse(requestId, map[e.code] ?? 400, e.code, e.message);
    }
    throw e;
  }
}
