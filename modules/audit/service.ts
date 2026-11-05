import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { auditLogs } from "@/lib/db/schema";
import type { Actor } from "@/modules/auth/service";

/**
 * Append-only audit for privileged actions: assignment, reassignment,
 * manual overrides, role/van changes, cancels, completions, demo resets.
 * Metadata is redacted by callers — never precise coords or raw PII.
 */
export async function writeAudit(input: {
  actor: Actor | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db().insert(auditLogs).values({
    actorId: input.actor?.userId ?? null,
    actorRole: input.actor?.role ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? null,
  });
}

export async function listAuditLogs(limit = 50) {
  const take = Math.min(Math.max(limit, 1), 50);
  return db()
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(take);
}

export async function listAuditForResource(resourceType: string, resourceId: string) {
  return db()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.resourceId, resourceId))
    .orderBy(desc(auditLogs.createdAt));
}
