"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [payment, setPayment] = useState<{ orderId: string; amountPaise: number; keyId: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/v1/bookings/${id}`, { credentials: "same-origin" });
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const data = (await res.json()) as { booking?: Record<string, unknown> };
    setBooking(data.booking ?? null);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function pay() {
    setMsg(null);
    const res = await fetch("/api/v1/payments/order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      credentials: "same-origin",
      body: JSON.stringify({ bookingId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as { order?: { orderId: string; amountPaise: number; keyId: string }; error?: { message?: string } };
    if (!res.ok || !data.order) {
      setMsg(data.error?.message ?? "Could not create payment order.");
      return;
    }
    // Load Razorpay Checkout (hosted — no card data touches our servers).
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    await new Promise<void>((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Checkout failed to load"));
      document.body.appendChild(script);
    });
    type RazorpayCtor = new (opts: unknown) => { open: () => void; on: (e: string, cb: () => void) => void };
    const RazorpayCtor = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
    const rzp = new RazorpayCtor({
      key: data.order.keyId,
      order_id: data.order.orderId,
      amount: data.order.amountPaise,
      currency: "INR",
      name: "EVgoSmart (demo)",
      description: "Test payment — no real charge",
      theme: { color: "#1b3a2d" },
      handler: async (resp: unknown) => {
        const r = resp as { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
        const v = await fetch("/api/v1/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            razorpayPaymentId: r.razorpay_payment_id,
            razorpayOrderId: r.razorpay_order_id,
            razorpaySignature: r.razorpay_signature,
          }),
        });
        setMsg(v.ok ? "Payment verified. Thank you." : "Payment could not be verified.");
        await load();
      },
    });
    rzp.open();
    setPayment({ orderId: data.order.orderId, amountPaise: data.order.amountPaise, keyId: data.order.keyId });
  }

  async function cancel() {
    const res = await fetch(`/api/v1/bookings/${id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ reason: "customer requested" }),
    });
    setMsg(res.ok ? "Booking cancelled." : "Could not cancel.");
    await load();
  }

  if (notFound) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-[-.03em]">Not found</h1>
        <p className="mt-1.5 text-sm text-muted">This booking does not exist or you cannot view it.</p>
      </div>
    );
  }
  if (!booking) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const status = String(booking.status ?? "");
  const completed = status === "completed";

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">{String(booking.reference ?? id)}</h1>
      <p className="mt-1.5 text-sm text-muted">
        {String(booking.address ?? "")} · {String(booking.batteryPercent ?? "")}% · {String(booking.connectorType ?? "")}
      </p>

      {msg && <p role="status" className="mt-3 text-sm text-accent-deep">{msg}</p>}

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Status</h2>
        <p className="mt-1 text-sm text-muted">Current: <strong>{status}</strong></p>
        <p className="mt-2 text-sm text-muted">
          Estimated {String(booking.estimatedKwh ?? "—")} kWh · ₹{((booking.estimatedTotalPaise as number | undefined) ?? 0) / 100}
          {booking.etaMinutes != null && <span className="ml-2">· ETA {String(booking.etaMinutes)} min</span>}
        </p>
        {completed && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">Payment status: <strong>{String(booking.paymentStatus ?? (booking as { payment_status?: string }).payment_status ?? "pending")}</strong></p>
            <button type="button" onClick={pay} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white">
              Pay now (Razorpay test)
            </button>
            {payment && <p className="text-xs text-muted">Order {payment.orderId} · ₹{(payment.amountPaise / 100).toFixed(0)} (demo — no real charge)</p>}
          </div>
        )}
        {!completed && !["cancelled", "expired", "failed"].includes(status) && (
          <button type="button" onClick={cancel} className="mt-4 rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">
            Cancel request
          </button>
        )}
      </div>

      <a href="/customer" className="mt-6 inline-block text-sm font-semibold text-accent hover:underline">
        Back to dashboard
      </a>
    </div>
  );
}
