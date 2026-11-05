"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  reference: string;
  status: string;
  address: string;
  etaMinutes: number | null;
  batteryPercent: number;
};

export default function DriverPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/v1/driver/jobs", { credentials: "same-origin" });
    const data = (await res.json()) as { jobs?: Job[] };
    setJobs(data.jobs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  async function post(path: string, body?: unknown) {
    setMsg(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; status?: string };
    if (!res.ok) {
      setMsg(data.error?.message ?? "Could not complete action.");
    } else {
      setMsg(`OK — ${data.status ?? "done"}.`);
      await load();
    }
  }

  const active = jobs.filter((j) => ["assigned", "en_route", "arrived", "charging"].includes(j.status));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Your jobs</h1>
      <p className="mt-1.5 text-sm text-muted">
        Assigned jobs appear here. Polling refreshes live state every 10s.
      </p>

      {msg && <p role="status" className="mt-3 text-sm text-accent-deep">{msg}</p>}

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Availability</h2>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => post("/api/v1/driver/availability", { online: true })} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white">
            Go online
          </button>
          <button type="button" onClick={() => post("/api/v1/driver/availability", { online: false })} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">
            Go offline
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Active jobs ({active.length})</h2>
        {loading ? (
          <p className="mt-1 text-sm text-muted">Loading…</p>
        ) : active.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No active job.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {active.map((j) => (
              <li key={j.id} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold">{j.reference}</span>
                  <span className="rounded-full bg-accent-softer px-2.5 py-1 text-[11px] font-bold text-accent-deep">{j.status}</span>
                  {j.etaMinutes != null && <span className="text-sm text-muted">ETA {j.etaMinutes} min</span>}
                  <span className="text-sm text-muted">{j.address} · {j.batteryPercent}%</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {j.status === "assigned" && (
                    <>
                      <button type="button" onClick={() => post(`/api/v1/bookings/${j.id}/accept`)} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">Accept</button>
                      <button type="button" onClick={() => post(`/api/v1/bookings/${j.id}/decline`)} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold">Decline</button>
                      <button type="button" onClick={() => post(`/api/v1/bookings/${j.id}/status`, { to: "en_route" })} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold">Start route</button>
                    </>
                  )}
                  {j.status === "en_route" && (
                    <button type="button" onClick={() => post(`/api/v1/bookings/${j.id}/status`, { to: "arrived" })} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">Arrived</button>
                  )}
                  {j.status === "arrived" && (
                    <button type="button" onClick={() => post(`/api/v1/bookings/${j.id}/status`, { to: "charging" })} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">Start charging</button>
                  )}
                  {j.status === "charging" && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const kwh = Number(fd.get("kwh"));
                        await post(`/api/v1/bookings/${j.id}/complete`, { deliveredKwh: kwh });
                      }}
                      className="flex items-center gap-2"
                    >
                      <label htmlFor={`kwh-${j.id}`} className="text-xs font-semibold">Delivered kWh</label>
                      <input id={`kwh-${j.id}`} name="kwh" type="number" step="0.1" min="0.1" required className="w-24 rounded-xl border border-line-strong bg-surface px-2 py-1.5 text-sm" />
                      <button type="submit" className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white">Complete</button>
                    </form>
                  )}
                  <button type="button" onClick={() => post(`/api/v1/bookings/${j.id}/status`, { to: "cancelled", reason: "driver reported issue" })} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold">Cancel</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">History</h2>
        <p className="mt-1 text-sm text-muted">{jobs.length} job(s) total.</p>
      </div>
    </div>
  );
}
