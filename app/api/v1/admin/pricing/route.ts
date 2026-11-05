import { getPricingForCity, upsertPricingRule } from "@/modules/payments/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireSession();
    const url = new URL(request.url);
    const city = url.searchParams.get("city") ?? "Bengaluru";
    const rule = await getPricingForCity(city);
    return Response.json({ pricing: rule ? { city: rule.city, baseFeePaise: rule.baseFeePaise, perKwhPaise: rule.perKwhPaise } : null, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    if (actor.role !== "admin") return errorResponse(requestId, 403, "FORBIDDEN", "Admin only.");
    const body = (await request.json().catch(() => null)) as { city?: string; baseFeePaise?: number; perKwhPaise?: number } | null;
    if (!body?.city || !Number.isInteger(body.baseFeePaise) || !Number.isInteger(body.perKwhPaise)) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "city, baseFeePaise, perKwhPaise (integers) required.");
    }
    const rule = await upsertPricingRule(actor, String(body.city).slice(0, 60), Number(body.baseFeePaise), Number(body.perKwhPaise));
    return Response.json({ pricing: rule ? { city: rule.city, baseFeePaise: rule.baseFeePaise, perKwhPaise: rule.perKwhPaise } : null, requestId });
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
