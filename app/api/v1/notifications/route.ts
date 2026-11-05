import { listMyNotifications } from "@/modules/notifications/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const notifications = await listMyNotifications(actor);
    return Response.json({ notifications, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
