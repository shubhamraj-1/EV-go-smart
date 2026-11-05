import { listAuditLogs } from "@/modules/audit/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "admin") return errorResponse(requestId, 403, "FORBIDDEN", "Admin only.");
    const logs = await listAuditLogs(50);
    return Response.json({ logs: logs.map((l) => ({ id: l.id, action: l.action, resourceType: l.resourceType, resourceId: l.resourceId, actorId: l.actorId, createdAt: l.createdAt.toISOString() })), requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Admin only.");
    }
    throw e;
  }
}
