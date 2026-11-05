import { driverStatusSchema } from "@/modules/dispatch/schema";
import { setDriverAvailability, DispatchError } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * POST /api/v1/driver/availability — driver goes online/offline.
 * Busy drivers (active job) cannot go offline mid-job.
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "driver") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only drivers can set availability.");
    }
    const body = await request.json().catch(() => null);
    const parsed = driverStatusSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "online (boolean) is required.");
    }
    const profile = await setDriverAvailability(actor, parsed.data.online);
    return Response.json({ status: profile?.status ?? null, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof DispatchError) {
      const map: Record<string, number> = {
        DRIVER_PROFILE_NOT_FOUND: 404,
        INVALID_TRANSITION: 409,
      };
      return errorResponse(requestId, map[e.code] ?? 400, e.code, e.message);
    }
    throw e;
  }
}
