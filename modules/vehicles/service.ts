import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { vehicles } from "@/lib/db/schema";
import type { Actor } from "@/modules/auth/service";
import type { CreateVehicleInput, UpdateVehicleInput } from "./schema";

export type VehicleRow = typeof vehicles.$inferSelect;

export type VehicleDto = {
  id: string;
  make: string;
  model: string;
  connectorType: string;
  batteryKwh: string;
  isDefault: boolean;
};

export function toDto(row: VehicleRow): VehicleDto {
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    connectorType: row.connectorType,
    batteryKwh: row.batteryKwh,
    isDefault: row.isDefault,
  };
}

export async function listVehicles(actor: Actor): Promise<VehicleRow[]> {
  return db()
    .select()
    .from(vehicles)
    .where(eq(vehicles.userId, actor.userId))
    .orderBy(desc(vehicles.createdAt));
}

export async function getVehicle(actor: Actor, id: string): Promise<VehicleRow | null> {
  const rows = await db()
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.userId, actor.userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createVehicle(actor: Actor, input: CreateVehicleInput): Promise<VehicleRow> {
  const dbi = db();
  const plate = input.licensePlate.trim().toUpperCase();

  const existing = await dbi
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.userId, actor.userId), eq(vehicles.licensePlate, plate)))
    .limit(1);
  if (existing.length > 0) throw new Error("VEHICLE_EXISTS");

  const rows = await dbi
    .insert(vehicles)
    .values({
      userId: actor.userId,
      make: input.make.trim(),
      model: input.model.trim(),
      year: input.year,
      connectorType: input.connectorType,
      batteryKwh: String(input.batteryKwh),
      licensePlate: plate,
      isDefault: input.isDefault,
    })
    .returning();
  return rows[0]!;
}

export async function updateVehicle(
  actor: Actor,
  id: string,
  input: UpdateVehicleInput,
): Promise<VehicleRow | null> {
  const current = await getVehicle(actor, id);
  if (!current) return null;

  const patch: Partial<VehicleRow> = {};
  if (input.make !== undefined) patch.make = input.make.trim();
  if (input.model !== undefined) patch.model = input.model.trim();
  if (input.year !== undefined) patch.year = input.year;
  if (input.connectorType !== undefined) patch.connectorType = input.connectorType;
  if (input.batteryKwh !== undefined) patch.batteryKwh = String(input.batteryKwh);
  if (input.licensePlate !== undefined) patch.licensePlate = input.licensePlate.trim().toUpperCase();
  if (input.isDefault !== undefined) patch.isDefault = input.isDefault;

  const rows = await db()
    .update(vehicles)
    .set(patch)
    .where(and(eq(vehicles.id, id), eq(vehicles.userId, actor.userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteVehicle(actor: Actor, id: string): Promise<boolean> {
  const rows = await db()
    .delete(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.userId, actor.userId)))
    .returning({ id: vehicles.id });
  return rows.length > 0;
}
