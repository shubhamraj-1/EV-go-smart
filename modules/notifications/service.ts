import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { notifications } from "@/lib/db/schema";
import type { Actor } from "@/modules/auth/service";

/**
 * Email via Resend (+ console fallback). Every send writes a
 * `notifications` row; never block booking flow on email failure.
 */
export async function queueNotification(
  userId: string,
  type: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db().insert(notifications).values({ userId, type, status: "pending", metadata: metadata ?? null });
  // Best-effort send; the row is the record even if sending fails.
  try {
    await sendEmail(type, metadata ?? {});
    await db()
      .update(notifications)
      .set({ status: "sent" })
      .where(eq(notifications.type, type));
  } catch {
    // Leave as pending; retry policy is a later concern.
  }
}

export async function listMyNotifications(actor: Actor) {
  const rows = await db()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function sendEmail(type: string, metadata: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.EMAIL_FROM ?? "EVgoSmart <noreply@demo.evgosmart.test>";
  const to = typeof metadata.to === "string" ? metadata.to : "";
  if (!apiKey || !to) {
    // Console provider: log in dev (never log precise coords — callers
    // must not put coords in metadata).
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email] ${type} -> ${to}`);
    }
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: subjectFor(type),
      html: htmlFor(type, metadata),
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

function subjectFor(type: string): string {
  const map: Record<string, string> = {
    "booking.requested": "Request received",
    "booking.assigned": "Driver assigned",
    "booking.completed": "Charge complete — receipt",
    "booking.cancelled": "Booking cancelled",
    "payment.receipt": "Payment receipt",
  };
  return map[type] ?? "EVgoSmart update";
}

function htmlFor(type: string, metadata: Record<string, unknown>): string {
  const ref = typeof metadata.reference === "string" ? metadata.reference : "";
  return `<p>${subjectFor(type)}${ref ? ` — ${ref}` : ""}.</p><p>Demo environment — simulated fleet, test payments.</p>`;
}
