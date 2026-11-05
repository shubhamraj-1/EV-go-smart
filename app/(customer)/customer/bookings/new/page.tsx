import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { getActor } from "@/modules/auth/service";
import { listVehicles } from "@/modules/vehicles/service";
import { NewBookingForm } from "./form";

export const metadata: Metadata = { title: "Request a charge" };

export default async function NewBookingPage() {
  const actor = await getActor();
  if (!actor) return null;

  // Customer-facing vehicle list (direct service-layer read).
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rows = user ? await listVehicles(actor) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Request a charge</h1>
      <p className="mt-1.5 text-sm text-muted">
        Bengaluru pilot · ₹199 base fee + ₹18/kWh, taxes included.
      </p>
      <NewBookingForm
        vehicles={rows.map((v) => ({
          id: v.id,
          label: `${v.make} ${v.model} (${v.connectorType})`,
          batteryKwh: v.batteryKwh,
        }))}
      />
    </div>
  );
}
