import "server-only";

import type { BookingStatus } from "@/modules/bookings/state-machine";

/**
 * Server-side Realtime publisher (docs/ARCHITECTURE.md).
 * Uses the broadcast REST API with the secret key so it works from serverless
 * functions without holding a socket. Clients subscribe only; they never publish.
 *
 * Channel names are constructed server-side only — never from client input.
 * Payloads are minimal DTOs with no PII and no precise coordinates
 * (coordinates go through the API, not broadcast — except van.location which
 * is delivered only to the assigned customer + ops via RLS).
 */
export type RealtimeEvent =
  | { type: "booking.created"; bookingId: string }
  | { type: "booking.assigned"; bookingId: string; driverId: string | null; vanId: string | null; etaMinutes: number }
  | { type: "booking.status_changed"; bookingId: string; status: BookingStatus; at: string }
  | { type: "booking.payment_updated"; bookingId: string; paymentStatus: string }
  | { type: "van.location"; vanId: string; lat: number; lng: number; heading?: number; at: string }
  | { type: "dispatch.queue_updated"; at: string };

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.replace(/\/$/, "");
}

function secretKey(): string {
  return process.env.SUPABASE_SECRET_KEY ?? "";
}

/**
 * Publish one Broadcast event to a private topic.
 * Failure is non-fatal: the database remains the source of truth, polling
 * is the fallback, so we catch and swallow (logged via console.warn in dev).
 */
export async function publish(topic: string, event: string, payload: unknown): Promise<void> {
  const url = supabaseUrl();
  const key = secretKey();
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${encodeURIComponent(event)}?private=true`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Non-fatal by design (see above).
  }
}

export function bookingTopic(bookingId: string): string {
  return `booking:${bookingId}`;
}

export function vanLocationTopic(vanId: string): string {
  return `van:${vanId}:location`;
}

export function driverJobsTopic(driverId: string): string {
  return `driver:${driverId}:jobs`;
}

export function dispatchQueueTopic(): string {
  return "dispatch:queue";
}

/** After an assignment/status change, notify all interested parties. */
export async function publishBookingEvent(
  bookingId: string,
  event: RealtimeEvent,
  opts?: { driverId?: string | null; vanId?: string | null; queue?: boolean },
): Promise<void> {
  await publish(bookingTopic(bookingId), event.type, event);
  if (opts?.driverId) {
    await publish(driverJobsTopic(opts.driverId), event.type, event);
  }
  if (opts?.queue) {
    await publish(dispatchQueueTopic(), "dispatch.queue_updated", {
      type: "dispatch.queue_updated",
      at: new Date().toISOString(),
    });
  }
}

export async function publishVanLocation(
  vanId: string,
  lat: number,
  lng: number,
  heading?: number,
): Promise<void> {
  await publish(vanLocationTopic(vanId), "van.location", {
    type: "van.location",
    vanId,
    lat,
    lng,
    heading,
    at: new Date().toISOString(),
  } satisfies RealtimeEvent);
}
