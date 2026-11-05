import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { rateLimits } from "@/lib/db/schema";

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

/**
 * Fixed-window rate limiter backed by the `rate_limits` table.
 * Per docs/ARCHITECTURE.md: booking creation is 5/hour/customer and
 * 20/day/customer. `checkRateLimit` increments the counter for the
 * current window and reports whether the request is within the limit.
 * The caller maps `!allowed` to 429 + `Retry-After`.
 *
 * Race safety: a single `INSERT ... ON CONFLICT DO UPDATE` with a
 * conditional reset keeps the counter and window consistent. On
 * conflict, if the stored window has expired we reset count to 1
 * and advance `reset_at`; otherwise we increment.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  const isoNow = now.toISOString();
  const isoReset = resetAt.toISOString();

  const rows = await db()
    .insert(rateLimits)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= ${isoNow}::timestamptz then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= ${isoNow}::timestamptz then ${isoReset}::timestamptz else ${rateLimits.resetAt} end`,
        updatedAt: now,
      },
    })
    .returning();

  const row = rows[0]!;
  return {
    allowed: row.count <= limit,
    limit,
    remaining: Math.max(0, limit - row.count),
    resetAt: row.resetAt,
  };
}
