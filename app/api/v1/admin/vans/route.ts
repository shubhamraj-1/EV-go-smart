import { listVans, upsertVan } from "@/modules/users/service";
import { vanUpsertSchema } from "@/modules/users/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "admin" && actor.role !== "dispatcher") return errorResponse(requestId, 403, "FORBIDDEN", "Admin/dispatcher only.");
    const vans = await listVans(actor);
    return Response.json({ vans, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return errorResponse(requestId, 403, "FORBIDDEN", "Admin/dispatcher only.");
    }
    throw e;
  }
}

export async function POST(request: Request) {
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
    const body = await request.json().catch(() => null);
    const parsed = vanUpsertSchema.safeParse(body);
    if (!parsed.success) return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid van data.");
    const van = await upsertVan(actor, { ...parsed.data, driverId: parsed.data.driverId ?? null });
    return Response.json({ van: { id: van.id, code: van.code, name: van.name, status: String(van.status) }, requestId }, { status: 201 });
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
