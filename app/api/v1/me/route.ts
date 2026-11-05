import { getActor, requireSession } from "@/modules/auth/service";
import { db } from "@/lib/db/default";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await getActor();
    if (!actor) return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    const rows = await db().select().from(profiles).where(eq(profiles.id, actor.userId)).limit(1);
    const p = rows[0];
    return Response.json({ profile: { id: actor.userId, role: actor.role, fullName: p?.fullName ?? null, phone: p?.phone ?? null }, requestId });
  } catch {
    return errorResponse(requestId, 500, "INTERNAL", "Failed to load profile.");
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const body = (await request.json().catch(() => null)) as { fullName?: string; phone?: string } | null;
    const patch: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
    if (typeof body?.fullName === "string" && body.fullName.trim().length >= 2) patch.fullName = body.fullName.trim().slice(0, 100);
    if (typeof body?.phone === "string") patch.phone = body.phone.trim().slice(0, 20) || null;
    // role is never writable here (see docs/SECURITY.md).
    const rows = await db().update(profiles).set(patch).where(eq(profiles.id, actor.userId)).returning();
    return Response.json({ profile: { id: rows[0]!.id, role: rows[0]!.role, fullName: rows[0]!.fullName, phone: rows[0]!.phone }, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
