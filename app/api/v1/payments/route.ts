import { listMyPayments } from "@/modules/payments/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const payments = await listMyPayments(actor);
    return Response.json({ payments, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
