"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { estimateCharge } from "@/modules/pricing";

type VehicleOption = { id: string; label: string; batteryKwh: string };

export function NewBookingForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [address, setAddress] = useState("");
  const [batteryPercent, setBatteryPercent] = useState(20);
  const [connectorType, setConnectorType] = useState<"CCS2" | "CHAdeMO" | "Type2" | "Other">("CCS2");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selected = vehicles.find((v) => v.id === vehicleId);
  const estimate = selected
    ? estimateCharge({
        baseFeePaise: 19_900,
        perKwhPaise: 1_800,
        vehicleBatteryKwh: Number(selected.batteryKwh),
        batteryPercent,
      })
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!vehicleId) {
      setError("Add a vehicle first (vehicle management is coming in the next slice).");
      return;
    }

    const lat = 12.9716;
    const lng = 77.5946;

    setPending(true);
    const res = await fetch("/api/v1/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        vehicleId,
        lat,
        lng,
        address,
        batteryPercent,
        connectorType,
      }),
    });

    if (!res.ok) {
      setError("Could not submit the request. Try again.");
      setPending(false);
      return;
    }

    const data = (await res.json()) as { booking: { id: string } };
    router.push(`/customer/bookings/${data.booking.id}`);
    router.refresh();
  }

  if (vehicles.length === 0) {
    return (
      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <p className="text-sm text-muted">
          Add a vehicle before requesting a charge. Vehicle management ships in the next slice of
          Phase 1.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      <div>
        <label htmlFor="vehicle" className="text-sm font-semibold">
          Vehicle
        </label>
        <select
          id="vehicle"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="address" className="text-sm font-semibold">
          Where are you parked?
        </label>
        <input
          id="address"
          type="text"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="12th Main, Indiranagar"
          className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="battery" className="text-sm font-semibold">
          Battery: {batteryPercent}%
        </label>
        <input
          id="battery"
          type="range"
          min={0}
          max={100}
          value={batteryPercent}
          onChange={(e) => setBatteryPercent(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div>
        <label htmlFor="connector" className="text-sm font-semibold">
          Connector
        </label>
        <select
          id="connector"
          value={connectorType}
          onChange={(e) =>
            setConnectorType(e.target.value as "CCS2" | "CHAdeMO" | "Type2" | "Other")
          }
          className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
        >
          <option value="CCS2">CCS2</option>
          <option value="CHAdeMO">CHAdeMO</option>
          <option value="Type2">Type2</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {estimate && (
        <p className="rounded-xl bg-accent-softer px-3.5 py-2.5 text-sm text-accent-deep">
          Estimated {estimate.estimatedKwh} kWh · ₹{(estimate.estimatedTotalPaise / 100).toFixed(0)}{" "}
          (demo pricing)
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-[46px] w-full rounded-full bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Sending request…" : "Request charge"}
      </button>
    </form>
  );
}
