"use client";

import { useEffect, useState } from "react";

type QueueItem = {
  id: string;
  reference: string;
  status: string;
  address: string;
  etaMinutes: number | null;
  createdAt: string;
  vanId: string | null;
};

type Van = { id: string; code: string; name: string; status: string; city: string };

export default function OpsPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [vans, setVans] = useState<Van[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [q, v] = await Promise.all([
      fetch("/api/v1/ops/queue", { credentials: "same-origin" }).then((r) => r.json()),
      fetch("/api/v1/ops/vans", { credentials: "same-origin" }).then((r) => r.json()),
    ]);
    setQueue((q as { queue?: QueueItem[] }).queue ?? []);
    setVans((v as { vans?: Van[] }).vans ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function assign(bookingId: string, vanId: string) {
    setMsg(null);
    const res = await fetch(`/api/v1/ops/bookings/${bookingId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ vanId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; status?: string };
    setMsg(res.ok ? `Assigned — ${data.status}.` : (data.error?.message ?? "Assign failed."));
    await load();
  }

  async function cancel(bookingId: string) {
    setMsg(null);
    const res = await fetch(`/api/v1/bookings/${bookingId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ to: "cancelled", reason: "dispatcher cancelled" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setMsg(res.ok ? "Cancelled." : (data.error?.message ?? "Cancel failed."));
    await load();
  }

  const now = Date.now();
  const slaMinutes = (createdAt: string) => Math.floor((now - new Date(createdAt).getTime()) / 60_000);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Dispatch queue</h1>
      <p className="mt-1.5 text-sm text-muted">
        Live active bookings. Assign or reassign vans; every override is audited.
      </p>

      {msg && <p role="status" className="mt-3 text-sm text-accent-deep">{msg}</p>}

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Queue ({queue.length})</h2>
        {queue.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No pending requests.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {queue.map((b) => (
              <li key={b.id} className="border-t border-line pt-3">
                <span className="text-sm font-semibold">{b.reference}</span>
                <span className="ml-2 rounded-full bg-accent-softer px-2 py-0.5 text-[11px] font-bold text-accent-deep">{b.status}</span>
                <span className="ml-2 text-sm text-muted">{b.address}</span>
                <span className="ml-2 text-sm text-muted">· {slaMinutes(b.createdAt)} min waiting</span>
                {b.etaMinutes != null && <span className="ml-2 text-sm text-muted">· ETA {b.etaMinutes}m</span>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => assign(b.id, "auto")} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">
                    Auto-assign
                  </button>
                  {vans.filter((v) => v.status === "available").slice(0, 3).map((v) => (
                    <button key={v.id} type="button" onClick={() => assign(b.id, v.id)} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold">
                      {v.code}
                    </button>
                  ))}
                  <button type="button" onClick={() => cancel(b.id)} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold">Cancel</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Fleet ({vans.length})</h2>
        {vans.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No vans configured.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {vans.map((v) => (
              <li key={v.id} className="border-t border-line pt-2 text-sm first:border-0 first:pt-0">
                <span className="font-semibold">{v.code}</span>
                <span className="ml-2 text-muted">{v.status} · {v.city}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
