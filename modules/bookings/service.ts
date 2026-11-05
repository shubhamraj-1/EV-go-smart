import "server-only";

import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { bookings, vehicles } from "@/lib/db/schema";
import { pointSql } from "@/lib/geo";
import { estimateCharge } from "@/modules/pricing";
import type { Actor } from "@/modules/auth/service";
import type { CreateBookingInput } from "./schema";

export type BookingRow = typeof bookings.$inferSelect;

export type BookingDto = {
  id: string;
  reference: string;
  status: string;
  address: string;
  batteryPercent: number;
  connectorType: string;
  estimatedKwh: string;
  estimatedTotalPaise: number;
  createdAt: string;
};

export function toDto(row: BookingRow): BookingDto {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    address: row.address,
    batteryPercent: row.batteryPercent,
    connectorType: row.connectorType,
    estimatedKwh: row.estimatedKwh,
    estimatedTotalPaise: row.estimatedTotalPaise,
    createdAt: row.createdAt.toISOString(),
  };
}

const BASE_FEE_PAISE = 19_900;
const PER_KWH_PAISE = 1_800;

async function ownVehicle(actor: Actor, vehicleId: string) {
  const rows = await db()
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, actor.userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createBooking(
  actor: Actor,
  input: CreateBookingInput,
  idempotencyKey: string,
): Promise<BookingDto> {
  const vehicle = await ownVehicle(actor, input.vehicleId);
  if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");

  // Idempotent retry: same key + same customer returns the original row.
  const existing = await db()
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.customerId, actor.userId), eq(bookings.idempotencyKey, idempotencyKey)),
    )
    .limit(1);
  if (existing[0]) return toDto(existing[0]);

  const est = estimateCharge({
    baseFeePaise: BASE_FEE_PAISE,
    perKwhPaise: PER_KWH_PAISE,
    vehicleBatteryKwh: Number(vehicle.batteryKwh),
    batteryPercent: input.batteryPercent,
    targetPercent: input.targetPercent,
  });

  const rows = await db()
    .insert(bookings)
    .values({
      customerId: actor.userId,
      vehicleId: vehicle.id,
      location: pointSql(input.lat, input.lng),
      address: input.address,
      batteryPercent: input.batteryPercent,
      connectorType: input.connectorType,
      notes: input.notes,
      baseFeePaise: BASE_FEE_PAISE,
      perKwhPaise: PER_KWH_PAISE,
      estimatedKwh: String(est.estimatedKwh),
      estimatedTotalPaise: est.estimatedTotalPaise,
      idempotencyKey,
    })
    .returning();
  const created = rows[0]!;
  return toDto(created);
}

export type BookingPage = { items: BookingDto[]; nextCursor: string | null };

/** Cursor pagination by (created_at desc, id desc). Limit capped at 50. */
export async function listMyBookings(
  actor: Actor,
  cursor?: string,
  limit = 20,
): Promise<BookingPage> {
  const take = Math.min(Math.max(limit, 1), 50);
  const conditions = [eq(bookings.customerId, actor.userId)];
  if (cursor) conditions.push(lt(bookings.createdAt, new Date(cursor)));

  const rows = await db()
    .select()
    .from(bookings)
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt), desc(bookings.id))
    .limit(take + 1);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toDto),
    nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
  };
}

/** Owner-scoped fetch: never returns another customer's booking. */
export async function getMyBooking(actor: Actor, id: string): Promise<BookingDto | null> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.customerId, actor.userId)))
    .limit(1);
  return rows[0] ? toDto(rows[0]) : null;
}

/** Dispatcher/admin read-only list (active queue). */
export async function listOpsQueue(): Promise<BookingDto[]> {
  const rows = await db()
    .select()
    .from(bookings)
    .orderBy(desc(bookings.createdAt))
    .limit(50);
  return rows.map(toDto);
}
