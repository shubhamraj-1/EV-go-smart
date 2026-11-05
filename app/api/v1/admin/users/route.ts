import { listUsers } from "@/modules/users/service";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "admin") return errorResponse(requestId, 403, "FORBIDDEN", "Admin only.");
    const limit = await checkRateLimit(`admin:mut:${actor.userId}`, 60, 60 * 60 * 1000);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests.", requestId } }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(limit.resetAt.getTime() / 1000)) } },
      );
    }
    const users = await listUsers(actor);
    return Response.json({ users, requestId });
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
