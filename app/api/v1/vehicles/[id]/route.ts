import { updateVehicleSchema } from "@/modules/vehicles/schema";
import { deleteVehicle, getVehicle, toDto, updateVehicle } from "@/modules/vehicles/service";
import { errorResponse } from "@/lib/errors";
import { requireSession } from "@/modules/auth/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const { id } = await params;
    const row = await getVehicle(actor, id);
    if (!row) return errorResponse(requestId, 404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
    return Response.json({ vehicle: toDto(row), requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = updateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(requestId, 400, "INVALID_INPUT", "Invalid vehicle data.");
    }

    const updated = await updateVehicle(actor, id, parsed.data);
    if (!updated) return errorResponse(requestId, 404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
    return Response.json({ vehicle: toDto(updated), requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const actor = await requireSession();
    const { id } = await params;
    const deleted = await deleteVehicle(actor, id);
    if (!deleted) return errorResponse(requestId, 404, "VEHICLE_NOT_FOUND", "Vehicle not found.");
    return Response.json({ deleted: true, requestId });
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return errorResponse(requestId, 401, "UNAUTHENTICATED", "Sign in required.");
    }
    throw e;
  }
}
