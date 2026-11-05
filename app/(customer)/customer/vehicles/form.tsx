"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VehicleForm() {
  const router = useRouter();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(2023);
  const [connectorType, setConnectorType] = useState("CCS2");
  const [batteryKwh, setBatteryKwh] = useState(40);
  const [licensePlate, setLicensePlate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const res = await fetch("/api/v1/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        make,
        model,
        year,
        connectorType,
        batteryKwh,
        licensePlate,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
      setError(data?.error?.message ?? "Could not save the vehicle.");
      return;
    }

    router.refresh();
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="make" className="text-sm font-semibold">
            Make
          </label>
          <input id="make" required value={make} onChange={(e) => setMake(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="model" className="text-sm font-semibold">
            Model
          </label>
          <input id="model" required value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="year" className="text-sm font-semibold">
            Year
          </label>
          <input id="year" type="number" min={2008} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="plate" className="text-sm font-semibold">
            License plate
          </label>
          <input id="plate" required value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="connector" className="text-sm font-semibold">
            Connector
          </label>
          <select id="connector" value={connectorType} onChange={(e) => setConnectorType(e.target.value)} className={inputClass}>
            <option value="CCS2">CCS2</option>
            <option value="CHAdeMO">CHAdeMO</option>
            <option value="Type2">Type2</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="battery" className="text-sm font-semibold">
            Battery (kWh)
          </label>
          <input id="battery" type="number" min={0.1} step={0.1} value={batteryKwh} onChange={(e) => setBatteryKwh(Number(e.target.value))} className={inputClass} />
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="min-h-[46px] rounded-full bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Saving…" : "Add vehicle"}
      </button>
    </form>
  );
}
