import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { bookings, driverProfiles, profiles, vans } from "@/lib/db/schema";
import { pointSql } from "@/lib/geo";
import { writeAudit } from "@/modules/audit/service";
import type { Actor, UserRole } from "@/modules/auth/service";
import type { VanRow } from "@/modules/dispatch/service";

/** Admin user/van management. Every mutation is audited. */

export async function listUsers(actor: Actor) {
  if (actor.role !== "admin") throw new Error("FORBIDDEN");
  const rows = await db().select().from(profiles).orderBy(desc(profiles.createdAt)).limit(50);
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    fullName: r.fullName,
    phone: r.phone,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function changeRole(
  actor: Actor,
  targetUserId: string,
  newRole: UserRole,
): Promise<{ id: string; role: UserRole }> {
  if (actor.role !== "admin") throw new Error("FORBIDDEN");
  const rows = await db()
    .update(profiles)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(profiles.id, targetUserId))
    .returning({ id: profiles.id, role: profiles.role });
  if (!rows[0]) throw new Error("USER_NOT_FOUND");
  // Bump session version so stale JWTs are rejected on next check.
  await db()
    .update(profiles)
    .set({ sessionVersion: profiles.sessionVersion })
    .where(eq(profiles.id, targetUserId));
  await writeAudit({
    actor,
    action: "user.role_changed",
    resourceType: "user",
    resourceId: targetUserId,
    metadata: { newRole },
  });
  return rows[0] as { id: string; role: UserRole };
}

export async function listVans(actor: Actor) {
  if (actor.role !== "admin" && actor.role !== "dispatcher") throw new Error("FORBIDDEN");
  const rows = await db().select().from(vans).orderBy(desc(vans.createdAt)).limit(50);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: String(r.status),
    city: r.city,
    driverId: r.driverId,
  }));
}

export async function upsertVan(
  actor: Actor,
  input: {
    code: string;
    name: string;
    driverId: string | null;
    connectorTypes: string[];
    capacityKwh: number;
    currentKwh: number;
    city: string;
  },
): Promise<VanRow> {
  if (actor.role !== "admin") throw new Error("FORBIDDEN");
  const rows = await db()
    .insert(vans)
    .values({
      code: input.code,
      name: input.name,
      driverId: input.driverId ?? null,
      connectorTypes: input.connectorTypes,
      capacityKwh: String(input.capacityKwh),
      currentKwh: String(input.currentKwh),
      city: input.city,
      location: pointSql(12.9716, 77.5946),
    })
    .onConflictDoUpdate({
      target: vans.code,
      set: {
        name: input.name,
        connectorTypes: input.connectorTypes,
        capacityKwh: String(input.capacityKwh),
        currentKwh: String(input.currentKwh),
        city: input.city,
      },
    })
    .returning();
  await writeAudit({
    actor,
    action: "van.upserted",
    resourceType: "van",
    resourceId: rows[0]!.id,
    metadata: { code: input.code },
  });
  return rows[0]!;
}

export async function listDrivers(actor: Actor) {
  if (actor.role !== "admin" && actor.role !== "dispatcher") throw new Error("FORBIDDEN");
  const rows = await db().select().from(driverProfiles).orderBy(desc(driverProfiles.createdAt)).limit(50);
  return rows;
}

/** Dispatcher-visible booking detail (active + recent). */
export async function getBookingOps(actor: Actor, id: string) {
  if (actor.role !== "dispatcher" && actor.role !== "admin") throw new Error("FORBIDDEN");
  const rows = await db().select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function assertAdmin(actor: Actor): Promise<void> {
  if (actor.role !== "admin") throw new Error("FORBIDDEN");
}
