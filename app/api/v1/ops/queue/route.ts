import { listOpsQueueExpanded } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * GET /api/v1/ops/queue — dispatcher/admin live queue of active bookings.
 * Polling fallback transport (Realtime lands in 2B).
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "dispatcher" && actor.role !== "admin") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only dispatchers or admins can view the queue.");
    }
    const queue = await listOpsQueueExpanded();
    return Response.json({ queue, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
