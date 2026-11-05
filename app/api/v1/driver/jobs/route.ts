import { listDriverJobs } from "@/modules/dispatch/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

/**
 * GET /api/v1/driver/jobs — own assigned jobs (paginated transport for polling).
 */
export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "driver") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Only drivers can view jobs.");
    }
    const jobs = await listDriverJobs(actor);
    return Response.json({ jobs, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
