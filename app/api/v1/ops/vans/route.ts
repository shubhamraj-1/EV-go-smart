import { listOpsVans } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * GET /api/v1/ops/vans — dispatcher/admin fleet snapshot (id/code/status/city only).
 * Precise coordinates are never exposed to non-assigned actors.
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "dispatcher" && actor.role !== "admin") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only dispatchers or admins can view the fleet.");
    }
    const vans = await listOpsVans();
    return Response.json({ vans, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
