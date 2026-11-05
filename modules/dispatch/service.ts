import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { bookings, driverLocations, driverProfiles, vans } from "@/lib/db/schema";
import { pointSql } from "@/lib/geo";
import { isValidTransition, type BookingStatus } from "@/modules/bookings/state-machine";
import { writeAudit } from "@/modules/audit/service";
import type { Actor } from "@/modules/auth/service";
import type { BookingRow } from "@/modules/bookings/service";
import type { CompleteInput, LocationPingInput } from "./schema";
import { getEta } from "./eta";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VanRow = typeof vans.$inferSelect;
export type DriverProfileRow = typeof driverProfiles.$inferSelect;

export type CandidateVan = VanRow & { distanceMeters: number; etaMinutes: number };

export type DispatchLease = { booking: BookingRow; van: VanRow; etaMinutes: number };

/** Customer/driver-facing DTOs never expose precise coords for other vans. */
export type BookingDispatchDto = {
  id: string;
  reference: string;
  status: string;
  customerId: string;
  vanId: string | null;
  driverId: string | null;
  connectorType: string;
  address: string;
  batteryPercent: number;
  etaMinutes: number | null;
  createdAt: string;
};

export function toDispatchDto(row: BookingRow): BookingDispatchDto {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    customerId: row.customerId,
    vanId: row.vanId,
    driverId: row.driverId,
    connectorType: row.connectorType,
    address: row.address,
    batteryPercent: row.batteryPercent,
    etaMinutes: row.etaMinutes,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DispatchError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "DispatchError";
  }
}

/** Accept window per docs/PRODUCT.md: driver has 60 seconds to accept. */
const ACCEPT_WINDOW_MS = 60_000;
const DEFAULT_DISPATCH_RADIUS_METERS = 15_000;

// ---------------------------------------------------------------------------
// Van candidate search (PostGIS KNN, connector + capacity filtered)
// ---------------------------------------------------------------------------

/**
 * Top-3 van candidates ordered by straight-line distance, filtered by
 * status='available', active, connector compatibility, minimum charge,
 * and within-radius. Ranking then applies ETA (road when possible).
 * Single PostGIS KNN query — index-assisted via GiST.
 */
export async function findCandidates(
  booking: BookingRow,
  radiusMeters = DEFAULT_DISPATCH_RADIUS_METERS,
): Promise<CandidateVan[]> {
  const neededKwh = Number(booking.estimatedKwh);
  const candidates = await rankByDistance(booking, neededKwh, radiusMeters);
  // ETA for top-3 only (quota control), 60s cache.
  const top = candidates.slice(0, 3);
  const withEta: CandidateVan[] = [];
  for (const c of top) {
    const eta = await getEta(c.van.id, booking.id, c.pos, c.bookingPos);
    withEta.push({ ...c.van, distanceMeters: c.distanceMeters, etaMinutes: eta.etaMinutes });
  }
  return withEta;
}

type Ranked = { van: VanRow; distanceMeters: number; pos: { lat: number; lng: number }; bookingPos: { lat: number; lng: number } };

/**
 * PostGIS KNN: `ORDER BY v.location <-> b.location` uses the GiST index.
 * Filters: available, active, connector match, min charge, within radius.
 */
async function rankByDistance(
  booking: BookingRow,
  neededKwh: number,
  radiusMeters: number,
): Promise<Ranked[]> {
  // One query using PostGIS KNN — index-assisted via GiST.
  const result = await db().execute(
    sql`
      select v.id, v.code, v.name, v.driver_id, v.status, v.connector_types,
             v.capacity_kwh::text as capacity_kwh,
             v.current_kwh::text as current_kwh,
             st_astext(v.location::geometry) as location,
             st_distance(v.location, b.location) as dist_m,
             st_y(b.location::geometry) as booking_lat,
             st_x(b.location::geometry) as booking_lng,
             st_y(v.location::geometry) as van_lat,
             st_x(v.location::geometry) as van_lng
      from public.vans v, public.bookings b
      where b.id = ${booking.id}
        and v.status = 'available' and v.active = true
        and ${booking.connectorType} = any (v.connector_types)
        and v.current_kwh >= ${neededKwh}
        and st_dwithin(v.location, b.location, ${radiusMeters})
      order by v.location <-> b.location
      limit 3
    `,
  );

  const list = result as unknown as Array<Record<string, unknown>>;
  const ranked: Ranked[] = [];
  for (const r of list) {
    const van: VanRow = {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      driverId: (r.driver_id as string | null) ?? null,
      status: String(r.status) as VanRow["status"],
      connectorTypes: (r.connector_types as string[] | null) ?? [],
      capacityKwh: String(r.capacity_kwh),
      currentKwh: String(r.current_kwh),
      location: String(r.location),
      locationUpdatedAt: new Date(),
      city: "Bengaluru",
      rating: "5.0",
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ranked.push({
      van,
      distanceMeters: Number(r.dist_m ?? 0),
      pos: { lat: Number(r.van_lat), lng: Number(r.van_lng) },
      bookingPos: { lat: Number(r.booking_lat), lng: Number(r.booking_lng) },
    });
  }
  return ranked;
}

// ---------------------------------------------------------------------------
// Atomic assignment
// ---------------------------------------------------------------------------

/**
 * Auto-dispatch: find the best van and atomically claim it.
 * `UPDATE … WHERE status='available' RETURNING id` closes the race —
 * only one concurrent caller can win a given van.
 */
export async function autoAssign(
  actor: Actor,
  bookingId: string,
): Promise<DispatchLease | null> {
  const booking = await getBookingOrThrow(bookingId);
  if (booking.status !== "requested") {
    throw new DispatchError("INVALID_TRANSITION", `Cannot dispatch from ${booking.status}`);
  }

  const candidates = await findCandidates(booking);
  for (const candidate of candidates) {
    // Atomic claim.
    const claimed = await db()
      .update(vans)
      .set({ status: "assigned", updatedAt: new Date() })
      .where(and(eq(vans.id, candidate.id), eq(vans.status, "available")))
      .returning({ id: vans.id, driverId: vans.driverId });

    if (claimed.length === 0) continue; // lost the race; try next candidate

    const vanId = claimed[0]!.id;
    const driverId = claimed[0]!.driverId;

    const updated = await applyTransition(booking, "assigned", actor, {
      vanId,
      driverId,
      etaMinutes: candidate.etaMinutes,
      assignedAt: new Date(),
      dispatchAttempts: (booking.dispatchAttempts ?? 0) + 1,
    });

    await writeAudit({
      actor,
      action: "booking.auto_assigned",
      resourceType: "booking",
      resourceId: bookingId,
      metadata: { vanId, etaMinutes: candidate.etaMinutes },
    });

    const vanRows = await db().select().from(vans).where(eq(vans.id, vanId)).limit(1);
    return { booking: updated, van: vanRows[0]!, etaMinutes: candidate.etaMinutes };
  }
  return null;
}

/**
 * Dispatcher manual assign/reassign (audited). The van must be available
 * (or already assigned to this booking). Releases the previous van first.
 */
export async function manualAssign(
  actor: Actor,
  bookingId: string,
  vanId: string,
): Promise<BookingRow> {
  const booking = await getBookingOrThrow(bookingId);
  if (!["requested", "assigned", "en_route"].includes(booking.status)) {
    throw new DispatchError("INVALID_TRANSITION", `Cannot assign from ${booking.status}`);
  }

  const vanRows = await db().select().from(vans).where(eq(vans.id, vanId)).limit(1);
  const van = vanRows[0];
  if (!van) throw new DispatchError("VAN_NOT_FOUND");
  // If the booking already points at this van but the van row isn't available,
  // only a truly idempotent retry (same booking+van) is allowed — anything else
  // is a genuine conflict. The atomic claim below re-checks status='available'.
  if (van.status !== "available" && booking.vanId !== vanId) {
    throw new DispatchError("VAN_UNAVAILABLE", "Van is not available");
  }

  const claimed = await db()
    .update(vans)
    .set({ status: "assigned", updatedAt: new Date() })
    .where(and(eq(vans.id, vanId), eq(vans.status, "available")))
    .returning({ id: vans.id, driverId: vans.driverId });

  // Empty result means the van was claimed concurrently — fail so the loser
  // gets VAN_UNAVAILABLE (409). The van release below must run only after the
  // claim succeeds so a failed race never frees a van another job owns.
  if (claimed.length === 0) {
    if (booking.vanId !== vanId) {
      throw new DispatchError("VAN_UNAVAILABLE", "Van is not available");
    }
    // Idempotent re-assign to same van: fall through.
  }

  // Release the previous van if any (only after the new van is claimed).
  if (booking.vanId && booking.vanId !== vanId) {
    await db()
      .update(vans)
      .set({ status: "available", updatedAt: new Date() })
      .where(eq(vans.id, booking.vanId));
  }

  // Idempotent re-assign to same van.
  const driverId = van.driverId ?? claimed[0]?.driverId ?? booking.driverId ?? null;

  const toStatus: BookingStatus = booking.status === "requested" ? "assigned" : (booking.status as BookingStatus);
  const updated = await applyTransitionRaw(booking, toStatus, actor, {
    vanId,
    driverId,
  });

  await writeAudit({
    actor,
    action: booking.status === "requested" ? "booking.assigned" : "booking.reassigned",
    resourceType: "booking",
    resourceId: bookingId,
    metadata: { vanId, previousVanId: booking.vanId, reason: "manual" },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Driver accept / decline (60s window)
// ---------------------------------------------------------------------------

export async function acceptBooking(actor: Actor, bookingId: string): Promise<BookingRow> {
  const booking = await getBookingOrThrow(bookingId);
  assertAssignedDriver(actor, booking);
  if (booking.status !== "assigned") {
    throw new DispatchError("INVALID_TRANSITION", `Cannot accept from ${booking.status}`);
  }
  const assignedAt = booking.assignedAt?.getTime() ?? booking.createdAt.getTime();
  if (Date.now() - assignedAt > ACCEPT_WINDOW_MS) {
    throw new DispatchError("ACCEPT_WINDOW_EXPIRED", "Accept window has expired");
  }
  // Accept = stay in assigned but mark accepted via event; transition to en_route
  // happens explicitly when the driver starts the route (per state machine).
  await recordEvent(booking, null, "assigned", actor, "driver.accepted");
  await writeAudit({
    actor,
    action: "booking.driver_accepted",
    resourceType: "booking",
    resourceId: bookingId,
  });
  return booking;
}

export async function declineBooking(actor: Actor, bookingId: string): Promise<BookingRow> {
  const booking = await getBookingOrThrow(bookingId);
  assertAssignedDriver(actor, booking);
  if (booking.status !== "assigned") {
    throw new DispatchError("INVALID_TRANSITION", `Cannot decline from ${booking.status}`);
  }
  // Release the van, return the booking to requested for re-dispatch.
  if (booking.vanId) {
    await db()
      .update(vans)
      .set({ status: "available", updatedAt: new Date() })
      .where(eq(vans.id, booking.vanId));
  }
  const updated = await applyTransition(booking, "requested", actor, { vanId: null, driverId: null });
  await writeAudit({
    actor,
    action: "booking.driver_declined",
    resourceType: "booking",
    resourceId: bookingId,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Status transitions (driver assigned, or dispatcher/admin override audited)
// ---------------------------------------------------------------------------

export async function transitionBooking(
  actor: Actor,
  bookingId: string,
  to: BookingStatus,
  reason?: string,
): Promise<BookingRow> {
  const booking = await getBookingOrThrow(bookingId);
  const from = booking.status as BookingStatus;
  if (!isValidTransition(from, to)) {
    throw new DispatchError("INVALID_TRANSITION", `Invalid transition ${from} -> ${to}`);
  }

  const isDriver = actor.role === "driver";
  const isOps = actor.role === "dispatcher" || actor.role === "admin";

  if (to === "cancelled" || to === "failed") {
    if (!isDriver && !isOps) throw new DispatchError("FORBIDDEN");
    if (!reason?.trim()) throw new DispatchError("REASON_REQUIRED", "A reason is required");
    if (isDriver) assertAssignedDriver(actor, booking);
    // Release van on terminal-cancel/failed.
    if (booking.vanId) {
      await db()
        .update(vans)
        .set({ status: "available", updatedAt: new Date() })
        .where(eq(vans.id, booking.vanId));
    }
    const updated = await applyTransition(booking, to, actor, {
      cancelReason: reason,
      cancelledBy: actor.userId,
    });
    await writeAudit({
      actor,
      action: `booking.${to}`,
      resourceType: "booking",
      resourceId: bookingId,
      metadata: { from, reason: reason.slice(0, 200) },
    });
    return updated;
  }

  // Forward progress states: assigned driver or ops override.
  if (isOps) {
    const updated = await applyTransition(booking, to, actor, {});
    await writeAudit({
      actor,
      action: "booking.manual_override",
      resourceType: "booking",
      resourceId: bookingId,
      metadata: { from, to, reason: reason ?? "ops override" },
    });
    return updated;
  }
  if (isDriver) {
    assertAssignedDriver(actor, booking);
    // Sync van status along the way.
    await syncVanStatus(booking, to);
    const updated = await applyTransition(booking, to, actor, {});
    await writeAudit({
      actor,
      action: "booking.status_changed",
      resourceType: "booking",
      resourceId: bookingId,
      metadata: { from, to },
    });
    return updated;
  }
  throw new DispatchError("FORBIDDEN");
}

/**
 * Customer self-cancel (own booking, before charging) — per PRODUCT.md table.
 */
export async function cancelByCustomer(actor: Actor, bookingId: string, reason?: string): Promise<BookingRow> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, actor.userId)))
    .limit(1);
  const booking = rows[0];
  if (!booking) throw new DispatchError("BOOKING_NOT_FOUND");
  const from = booking.status as BookingStatus;
  if (!isValidTransition(from, "cancelled")) {
    throw new DispatchError("INVALID_TRANSITION", `Cannot cancel from ${from}`);
  }
  if (booking.vanId) {
    await db()
      .update(vans)
      .set({ status: "available", updatedAt: new Date() })
      .where(eq(vans.id, booking.vanId));
  }
  const updated = await applyTransition(booking, "cancelled", actor, {
    cancelReason: reason ?? "customer requested",
    cancelledBy: actor.userId,
  });
  await writeAudit({
    actor,
    action: "booking.cancelled",
    resourceType: "booking",
    resourceId: bookingId,
    metadata: { from, reason: (reason ?? "customer requested").slice(0, 200) },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Complete (charging -> completed, delivered kWh, money computed server-side)
// ---------------------------------------------------------------------------

export async function completeBooking(
  actor: Actor,
  bookingId: string,
  input: CompleteInput,
): Promise<BookingRow> {
  const booking = await getBookingOrThrow(bookingId);
  assertAssignedDriver(actor, booking);
  if (booking.status !== "charging") {
    throw new DispatchError("INVALID_TRANSITION", `Cannot complete from ${booking.status}`);
  }
  if (!(input.deliveredKwh > 0)) throw new DispatchError("INVALID_INPUT", "deliveredKwh must be positive");

  // Verify against van capacity.
  if (booking.vanId) {
    const vanRows = await db().select().from(vans).where(eq(vans.id, booking.vanId)).limit(1);
    const van = vanRows[0];
    if (van && input.deliveredKwh > Number(van.capacityKwh)) {
      throw new DispatchError("EXCEEDS_CAPACITY", "Delivered kWh exceeds van capacity");
    }
    await db()
      .update(vans)
      .set({ status: "returning" as never, updatedAt: new Date() })
      .where(eq(vans.id, booking.vanId));
  }

  // Final amount from the booking's frozen pricing snapshot (per docs/PRODUCT.md).
  const finalTotalPaise = booking.baseFeePaise + Math.round(input.deliveredKwh * booking.perKwhPaise);

  const updated = await applyTransition(booking, "completed", actor, {
    deliveredKwh: String(input.deliveredKwh),
    finalTotalPaise,
    completedAt: new Date(),
  });

  await writeAudit({
    actor,
    action: "booking.completed",
    resourceType: "booking",
    resourceId: bookingId,
    metadata: { deliveredKwh: input.deliveredKwh, finalTotalPaise },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Driver availability + location ping
// ---------------------------------------------------------------------------

export async function setDriverAvailability(actor: Actor, online: boolean): Promise<DriverProfileRow | null> {
  const rows = await db()
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, actor.userId))
    .limit(1);
  if (rows.length === 0) throw new DispatchError("DRIVER_PROFILE_NOT_FOUND");
  const status = online ? "available" : "offline";
  if (online && rows[0]!.status === "busy") {
    throw new DispatchError("INVALID_TRANSITION", "Driver is busy on an active job");
  }
  const updated = await db()
    .update(driverProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(driverProfiles.userId, actor.userId))
    .returning();
  // Keep the van status in sync when the van belongs to this driver.
  if (rows[0]!.currentVanId) {
    await db()
      .update(vans)
      .set({ status: online ? "available" as never : "offline" as never, updatedAt: new Date() })
      .where(eq(vans.id, rows[0]!.currentVanId!));
  }
  return updated[0] ?? null;
}

export async function recordLocationPing(actor: Actor, input: LocationPingInput): Promise<{ id: number; createdAt: string }> {
  const profileRows = await db()
    .select()
    .from(driverProfiles)
    .where(eq(driverProfiles.userId, actor.userId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile?.currentVanId) throw new DispatchError("NO_ACTIVE_VAN", "Driver has no current van");

  const vanId = profile.currentVanId;
  const active = await db()
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, actor.userId),
        eq(bookings.vanId, vanId),
        inArray(bookings.status, ["assigned", "en_route", "arrived", "charging"]),
      ),
    )
    .limit(1);
  if (active.length === 0) throw new DispatchError("NO_ACTIVE_JOB", "No active job for this van");

  const rows = await db()
    .insert(driverLocations)
    .values({
      vanId,
      driverId: actor.userId,
      location: pointSql(input.lat, input.lng),
      heading: input.heading ?? null,
    })
    .returning({ id: driverLocations.id, createdAt: driverLocations.createdAt });

  // Update van last-known location (PostGIS point).
  await db()
    .update(vans)
    .set({ location: pointSql(input.lat, input.lng), locationUpdatedAt: new Date() })
    .where(eq(vans.id, vanId));

  return { id: rows[0]!.id, createdAt: rows[0]!.createdAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Reads (DTOs; never raw rows with coords)
// ---------------------------------------------------------------------------

export async function getBookingForActor(actor: Actor, id: string): Promise<BookingDispatchDto | null> {
  const rows = await db().select().from(bookings).where(eq(bookings.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!canReadBooking(actor, row)) return null;
  return toDispatchDto(row);
}

export async function listDriverJobs(actor: Actor): Promise<BookingDispatchDto[]> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(eq(bookings.driverId, actor.userId))
    .orderBy(desc(bookings.createdAt))
    .limit(50);
  return rows.map(toDispatchDto);
}

export async function listOpsVans(): Promise<Array<{ id: string; code: string; name: string; status: string; city: string; driverId: string | null }>> {
  const rows = await db()
    .select({ id: vans.id, code: vans.code, name: vans.name, status: vans.status, city: vans.city, driverId: vans.driverId })
    .from(vans)
    .orderBy(desc(vans.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, status: String(r.status) }));
}

export async function listOpsQueueExpanded(): Promise<BookingDispatchDto[]> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(inArray(bookings.status, ["requested", "assigned", "en_route", "arrived", "charging"]))
    .orderBy(desc(bookings.createdAt))
    .limit(50);
  return rows.map(toDispatchDto);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function getBookingOrThrow(id: string): Promise<BookingRow> {
  const rows = await db().select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!rows[0]) throw new DispatchError("BOOKING_NOT_FOUND");
  return rows[0]!;
}

function assertAssignedDriver(actor: Actor, booking: BookingRow): void {
  if (actor.role !== "driver" || booking.driverId !== actor.userId) {
    throw new DispatchError("FORBIDDEN", "Only the assigned driver can do this");
  }
}

function canReadBooking(actor: Actor, booking: BookingRow): boolean {
  if (actor.userId === booking.customerId) return true;
  if (actor.role === "driver" && booking.driverId === actor.userId) return true;
  if (actor.role === "dispatcher" || actor.role === "admin") {
    return ["requested", "assigned", "en_route", "arrived", "charging", "completed", "cancelled", "expired", "failed"].includes(booking.status as BookingStatus);
  }
  return false;
}

async function applyTransition(
  booking: BookingRow,
  to: BookingStatus,
  actor: Actor,
  patch: Partial<BookingRow>,
): Promise<BookingRow> {
  const from = booking.status as BookingStatus;
  if (!isValidTransition(from, to)) {
    throw new DispatchError("INVALID_TRANSITION", `Invalid transition ${from} -> ${to}`);
  }
  const rows = await db()
    .update(bookings)
    .set({ status: to, ...patch, updatedAt: new Date() })
    .where(eq(bookings.id, booking.id))
    .returning();
  await recordEvent(booking, from, to, actor, `booking.${to}`, patch);
  return rows[0]!;
}

async function applyTransitionRaw(
  booking: BookingRow,
  to: BookingStatus,
  actor: Actor,
  patch: Partial<BookingRow>,
): Promise<BookingRow> {
  // Manual assign when already assigned: status does not change.
  const from = booking.status as BookingStatus;
  const rows = await db()
    .update(bookings)
    .set({ status: to, ...patch, updatedAt: new Date() })
    .where(eq(bookings.id, booking.id))
    .returning();
  await recordEvent(booking, from, to, actor, `booking.${to}`, patch);
  return rows[0]!;
}

async function recordEvent(
  booking: BookingRow,
  from: BookingStatus | null,
  to: BookingStatus | null,
  actor: Actor,
  type: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Redact coordinates: only status-relevant fields.
  const safe = metadata
    ? Object.fromEntries(
        Object.entries(metadata).filter(([k]) => !["location", "lat", "lng"].includes(k)),
      )
    : null;
  await db().execute(
    sql`insert into public.booking_events (booking_id, type, from_status, to_status, actor_id, actor_role, metadata)
        values (${booking.id}, ${type}, ${from ?? null}, ${to ?? null}, ${actor.userId}, ${actor.role}, ${safe ? sql`${JSON.stringify(safe)}::jsonb` : sql`null`})`,
  );
}

async function syncVanStatus(booking: BookingRow, to: BookingStatus): Promise<void> {
  if (!booking.vanId) return;
  const map: Partial<Record<BookingStatus, VanRow["status"]>> = {
    en_route: "en_route",
    charging: "charging",
    completed: "returning",
  };
  const st = map[to];
  if (st) {
    await db().update(vans).set({ status: st, updatedAt: new Date() }).where(eq(vans.id, booking.vanId));
  }
}
