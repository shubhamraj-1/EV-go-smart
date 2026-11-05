import { changeRole } from "@/modules/users/service";
import { roleChangeSchema } from "@/modules/users/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = roleChangeSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, 400, "INVALID_INPUT", "role must be customer|driver|dispatcher|admin.");
    const updated = await changeRole(actor, id, parsed.data.role);
    return Response.json({ user: updated, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Admin only.");
    }
    if (e instanceof Error && e.message === "USER_NOT_FOUND") {
      return errorResponse(requestId, 404, "USER_NOT_FOUND", "User not found.");
    }
    throw e;
  }
}
