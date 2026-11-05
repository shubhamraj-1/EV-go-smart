import "server-only";

import { createHmac } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/default";
import { payments, bookings, pricingRules, webhookEvents } from "@/lib/db/schema";
import { writeAudit } from "@/modules/audit/service";
import type { Actor } from "@/modules/auth/service";

export class PaymentError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "PaymentError";
  }
}

/**
 * Razorpay payments (test mode). Server is the only place amounts are
 * computed: order amount = booking.final_total_paise (set at completion).
 * Webhook is the source of truth; the client verify callback is a fast path.
 * No card data ever touches our servers (hosted Checkout).
 */

export async function createOrder(
  actor: Actor,
  bookingId: string,
  idempotencyKey?: string,
): Promise<{ orderId: string; amountPaise: number; currency: string; receipt: string; keyId: string }> {
  const rows = await db()
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.customerId, actor.userId)))
    .limit(1);
  const booking = rows[0];
  if (!booking) throw new PaymentError("BOOKING_NOT_FOUND");
  if (booking.status !== "completed") {
    throw new PaymentError("INVALID_TRANSITION", "Only completed bookings can be paid");
  }
  if (booking.paymentStatus === "paid" || booking.paymentStatus === "refunded") {
    throw new PaymentError("ALREADY_PAID", "Booking is already paid");
  }
  const amountPaise = booking.finalTotalPaise;
  if (!amountPaise || amountPaise <= 0) {
    throw new PaymentError("NO_AMOUNT", "Booking has no final amount");
  }

  if (idempotencyKey) {
    const existing = await db()
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.receipt, idempotencyKey)))
      .limit(1);
    if (existing[0]) {
      return {
        orderId: existing[0]!.orderId,
        amountPaise: existing[0]!.amountPaise,
        currency: existing[0]!.currency,
        receipt: existing[0]!.receipt,
        keyId: keyId(),
      };
    }
  }

  const receipt = idempotencyKey ?? `rcpt_${booking.reference}`;
  const orderIdLocal = `order_${booking.reference}_${Date.now().toString(36)}`;
  await db().insert(payments).values({
    bookingId,
    orderId: orderIdLocal,
    amountPaise,
    currency: "INR",
    status: "created",
    receipt,
    notes: { bookingId, reference: booking.reference },
  });

  if (process.env.RAZORPAY_KEY_SECRET && process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
    try {
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
        },
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes: { bookingId } }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { id?: string };
      if (res.ok && data.id) {
        await db().update(payments).set({ orderId: data.id, updatedAt: new Date() }).where(eq(payments.orderId, orderIdLocal));
        return { orderId: data.id, amountPaise, currency: "INR", receipt, keyId: keyId() };
      }
    } catch {
      // fall through to local order id
    }
  }

  return { orderId: orderIdLocal, amountPaise, currency: "INR", receipt, keyId: keyId() };
}

export async function verifyCheckoutSignature(
  actor: Actor,
  input: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string },
): Promise<{ bookingId: string; paymentStatus: string }> {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");
  if (!cryptoEquals(expected, input.razorpaySignature)) {
    throw new PaymentError("INVALID_SIGNATURE", "Payment signature verification failed");
  }

  const rows = await db()
    .select()
    .from(payments)
    .where(eq(payments.orderId, input.razorpayOrderId))
    .limit(1);
  const payment = rows[0];
  if (!payment) throw new PaymentError("ORDER_NOT_FOUND");

  const bRows = await db()
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, payment.bookingId), eq(bookings.customerId, actor.userId)))
    .limit(1);
  if (!bRows[0]) throw new PaymentError("FORBIDDEN");
  const booking = bRows[0]!;

  if (process.env.RAZORPAY_KEY_SECRET && process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
    const amount = await fetchPaymentAmount(input.razorpayPaymentId);
    if (amount != null && amount !== payment.amountPaise) {
      throw new PaymentError("AMOUNT_MISMATCH", "Payment amount does not match order");
    }
  }

  return markCaptured(payment.id, booking.id, input.razorpayPaymentId);
}

export async function handleWebhook(
  rawBody: string,
  signature: string | null,
  eventId: string,
  type: string,
): Promise<{ status: "processed" | "ignored" | "failed" }> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (secret && signature) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!cryptoEquals(expected, signature)) {
      throw new PaymentError("INVALID_SIGNATURE", "Webhook signature verification failed");
    }
  }

  const inserted = await db()
    .insert(webhookEvents)
    .values({
      eventId,
      type,
      payloadHash: sha256Hex(rawBody),
      status: "processed",
    })
    .onConflictDoNothing({ target: webhookEvents.eventId })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) return { status: "ignored" };

  if (type !== "payment.captured" && type !== "payment.authorized") {
    return { status: "processed" };
  }

  const payload = JSON.parse(rawBody) as {
    payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } };
  };
  const entity = payload.payload?.payment?.entity;
  if (!entity?.order_id || !entity?.id) return { status: "processed" };

  const rows = await db().select().from(payments).where(eq(payments.orderId, entity.order_id)).limit(1);
  const payment = rows[0];
  if (!payment) return { status: "processed" };

  if (entity.amount != null && entity.amount !== payment.amountPaise) {
    await db().update(webhookEvents).set({ status: "failed" }).where(eq(webhookEvents.eventId, eventId));
    throw new PaymentError("AMOUNT_MISMATCH", "Webhook amount mismatch");
  }

  await db()
    .update(payments)
    .set({ status: "captured", paymentId: entity.id, updatedAt: new Date() })
    .where(eq(payments.id, payment.id));
  await db()
    .update(bookings)
    .set({ paymentStatus: "paid", updatedAt: new Date() })
    .where(eq(bookings.id, payment.bookingId));

  return { status: "processed" };
}

export async function createRazorpayOrder(bookingId: string, amountPaise: number, receipt: string) {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEYS_MISSING");

  const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { bookingId },
    }),
  });

  if (!orderResponse.ok) throw new Error("RAZORPAY_ORDER_FAILED");
  const order = await orderResponse.json();

  await db().insert(payments).values({
    bookingId,
    orderId: order.id,
    amountPaise,
    receipt,
    status: "created",
  });

  return order;
}

export async function verifySignature(orderId: string, paymentId: string, signature: string) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new Error("RAZORPAY_SECRET_MISSING");

  const body = `${orderId}|${paymentId}`;
  const expectedSignature = createHmac("sha256", keySecret).update(body).digest("hex");

  return expectedSignature === signature;
}

export async function capturePayment(bookingId: string, orderId: string, paymentId: string) {
  return await db().transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ paymentId, status: "captured", updatedAt: new Date() })
      .where(eq(payments.orderId, orderId));

    await tx
      .update(bookings)
      .set({ paymentStatus: "paid", updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));
  });
}

export async function listMyPayments(actor: Actor) {
  const rows = await db()
    .select()
    .from(payments)
    .innerJoin(bookings, eq(payments.bookingId, bookings.id))
    .where(eq(bookings.customerId, actor.userId))
    .orderBy(desc(payments.createdAt))
    .limit(50);
  return rows.map((r) => ({
    id: r.payments.id,
    bookingId: r.payments.bookingId,
    orderId: r.payments.orderId,
    amountPaise: r.payments.amountPaise,
    status: r.payments.status,
    createdAt: r.payments.createdAt.toISOString(),
  }));
}

// --- Pricing rules (admin) -----------------------------------------------

export async function getPricingForCity(city = "Bengaluru") {
  const rows = await db()
    .select()
    .from(pricingRules)
    .where(and(eq(pricingRules.city, city), eq(pricingRules.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertPricingRule(
  actor: Actor,
  city: string,
  baseFeePaise: number,
  perKwhPaise: number,
) {
  await db()
    .insert(pricingRules)
    .values({ city, baseFeePaise, perKwhPaise, active: true })
    .onConflictDoNothing();
  await writeAudit({
    actor,
    action: "pricing.upsert",
    resourceType: "pricing_rule",
    resourceId: city,
    metadata: { baseFeePaise, perKwhPaise },
  });
  return getPricingForCity(city);
}

// --- Internals ------------------------------------------------------------

function keyId(): string {
  return process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
}

function cryptoEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sha256Hex(s: string): string {
  return createHmac("sha256", "").update(s).digest("hex");
}

async function markCaptured(
  paymentRowId: string,
  bookingId: string,
  razorpayPaymentId: string,
): Promise<{ bookingId: string; paymentStatus: string }> {
  await db()
    .update(payments)
    .set({ status: "captured", paymentId: razorpayPaymentId, updatedAt: new Date() })
    .where(eq(payments.id, paymentRowId));
  const bRows = await db()
    .update(bookings)
    .set({ paymentStatus: "paid", updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning({ paymentStatus: bookings.paymentStatus });
  return { bookingId, paymentStatus: bRows[0]?.paymentStatus ?? "paid" };
}

async function fetchPaymentAmount(paymentId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { amount?: number };
    return res.ok && typeof data.amount === "number" ? data.amount : null;
  } catch {
    return null;
  }
}
