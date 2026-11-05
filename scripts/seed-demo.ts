/**
 * Seed the demo project. Guarded: refuses unless DEMO_MODE=true AND the
 * Supabase project ref is on the allowlist (SUPABASE_DEMO_PROJECT_REFS).
 * Never run against production.
 */
import { createClient } from "@supabase/supabase-js";
import pg from "postgres";

function assertDemoGuard() {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Refusing to seed: DEMO_MODE must be 'true'.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const allow = (process.env.SUPABASE_DEMO_PROJECT_REFS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ref = url.replace("https://", "").split(".")[0] ?? "";
  if (allow.length > 0 && !allow.includes(ref)) {
    throw new Error(`Refusing to seed: project ref '${ref}' is not on the demo allowlist.`);
  }
}

async function main() {
  assertDemoGuard();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secret = process.env.SUPABASE_SECRET_KEY!;
  const dbUrl = process.env.DIRECT_DATABASE_URL!;
  const service = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const sql = pg(dbUrl, { prepare: false });

  const accounts = [
    { email: "customer@demo.evgosmart.test", role: "customer", name: "Demo Customer" },
    { email: "driver@demo.evgosmart.test", role: "driver", name: "Demo Driver" },
    { email: "dispatcher@demo.evgosmart.test", role: "dispatcher", name: "Demo Dispatcher" },
    { email: "admin@demo.evgosmart.test", role: "admin", name: "Demo Admin" },
  ];

  const password = "Demo@12345";
  const users: Record<string, string> = {};

  for (const a of accounts) {
    // Idempotent: try create, fall back to lookup.
    let userId: string | null = null;
    const { data, error } = await service.auth.admin.createUser({
      email: a.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: a.name },
    });
    if (!error && data.user) {
      userId = data.user.id;
    } else {
      // Already exists — find via admin list (small demo only).
      const { data: list } = await service.auth.admin.listUsers();
      userId = list?.users.find((u) => u.email === a.email)?.id ?? null;
    }
    if (!userId) throw new Error(`Could not create/find demo user ${a.email}`);
    users[a.role] = userId;
    await sql`
      insert into public.profiles (id, full_name, role)
      values (${userId}, ${a.name}, ${a.role})
      on conflict (id) do update set role = excluded.role, full_name = excluded.full_name
    `;
  }

  // Driver profile + van.
  const driverId = users["driver"]!;
  await sql`
    insert into public.driver_profiles (user_id, phone, license_number, verification_status, status, rating)
    values (${driverId}, '+919000000001', 'DL-DEMO-1', 'verified', 'available', 5.0)
    on conflict (user_id) do update set status = 'available', verification_status = 'verified'
  `;
  const vans = await sql`
    insert into public.vans (code, name, driver_id, status, connector_types, capacity_kwh, current_kwh, location, city)
    values ('DEMO-01', 'Demo Van 1', ${driverId}, 'available', ARRAY['CCS2','CHAdeMO','Type2']::text[], 60, 55, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, 'Bengaluru')
    on conflict (code) do update set status = 'available', driver_id = excluded.driver_id
    returning id
  `;
  const vanId = vans[0]?.id as string;
  await sql`update public.driver_profiles set current_van_id = ${vanId} where user_id = ${driverId}`;

  // Customer vehicle.
  const customerId = users["customer"]!;
  const vehicles = await sql`
    insert into public.vehicles (user_id, make, model, year, connector_type, battery_kwh, license_plate)
    values (${customerId}, 'Tata', 'Nexon EV', 2023, 'CCS2', 40, 'DEMO-EV-01')
    on conflict (user_id, license_plate) do update set make = excluded.make
    returning id
  `;
  const vehicleId = vehicles[0]?.id as string;

  // 3 active bookings + completed history.
  const bookings = await sql`
    insert into public.bookings (customer_id, vehicle_id, van_id, driver_id, status, location, address, battery_percent, connector_type, base_fee_paise, per_kwh_paise, estimated_kwh, estimated_total_paise)
    values
      (${customerId}, ${vehicleId}, ${vanId}, ${driverId}, 'assigned', ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, '12th Main, Indiranagar', 20, 'CCS2', 19900, 1800, 24.00, 63100),
      (${customerId}, ${vehicleId}, ${vanId}, ${driverId}, 'en_route', ST_SetSRID(ST_MakePoint(77.60, 12.97), 4326)::geography, 'MG Road', 15, 'CCS2', 19900, 1800, 26.00, 66700),
      (${customerId}, ${vehicleId}, null, null, 'requested', ST_SetSRID(ST_MakePoint(77.59, 12.97), 4326)::geography, 'Whitefield', 30, 'CCS2', 19900, 1800, 20.00, 55900)
    returning id
  `;

  // Pricing rule.
  await sql`
    insert into public.pricing_rules (city, base_fee_paise, per_kwh_paise, active)
    values ('Bengaluru', 19900, 1800, true)
    on conflict do nothing
  `;

  console.log(`Seeded demo: users=${Object.keys(users).length}, vans=1, vehicles=1, bookings=${bookings.length}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
