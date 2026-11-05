import type { Metadata } from "next";
import { getActor } from "@/modules/auth/service";
import { listVehicles } from "@/modules/vehicles/service";
import { VehicleForm } from "./form";
import { DeleteVehicleButton } from "./delete-button";

export const metadata: Metadata = { title: "Your vehicles" };

export default async function VehiclesPage() {
  const actor = await getActor();
  if (!actor) return null;

  const rows = await listVehicles(actor);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Your vehicles</h1>
      <p className="mt-1.5 text-sm text-muted">
        Add the EVs you drive. Only your vehicles are listed here.
      </p>

      <VehicleForm />

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No vehicles yet. Add one above.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((v) => (
              <li key={v.id} className="flex items-center gap-3 border-t border-line pt-3 first:border-0 first:pt-0">
                <span className="text-sm font-semibold">
                  {v.make} {v.model}
                </span>
                <span className="text-sm text-muted">{v.connectorType}</span>
                <span className="ml-auto text-sm text-muted">{v.licensePlate}</span>
                <DeleteVehicleButton id={v.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
