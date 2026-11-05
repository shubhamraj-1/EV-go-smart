import { createVehicleSchema } from "@/modules/vehicles/schema";
import { createVehicle, listVehicles, toDto } from "@/modules/vehicles/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const rows = await listVehicles(actor);
    return Response.json({ vehicles: rows.map(toDto), requestId });
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
    const body = await request.json().catch(() => null);
    const parsed = createVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid vehicle data.");
    }

    try {
      const created = await createVehicle(actor, parsed.data);
      return Response.json({ vehicle: toDto(created), requestId }, { status: 201 });
    } catch (e) {
      if (e instanceof Error && e.message === "VEHICLE_EXISTS") {
        return errorResponse(requestId, 409, "VEHICLE_EXISTS", "A vehicle with this plate already exists.");
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
