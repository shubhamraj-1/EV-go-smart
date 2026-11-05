/**
 * Reset demo data — deletes app tables only (never touches auth schema
 * beyond deleting demo users). Same guards as seed-demo.
 */
import pg from "postgres";

function assertDemoGuard() {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Refusing to reset: DEMO_MODE must be 'true'.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const allow = (process.env.SUPABASE_DEMO_PROJECT_REFS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ref = url.replace("https://", "").split(".")[0] ?? "";
  if (allow.length > 0 && !allow.includes(ref)) {
    throw new Error(`Refusing to reset: project ref '${ref}' is not on the demo allowlist.`);
  }
}

async function main() {
  assertDemoGuard();
  const sql = pg(process.env.DIRECT_DATABASE_URL!, { prepare: false });

  // Order matters (FKs). Truncate app tables only.
  await sql`truncate table
    public.payments,
    public.webhook_events,
    public.notifications,
    public.booking_events,
    public.bookings,
    public.driver_locations,
    public.vans,
    public.driver_profiles,
    public.vehicles,
    public.audit_logs,
    public.pricing_rules,
    public.service_areas
    restart identity cascade`;

  // Delete demo auth users (profiles cascade via FK on auth.users delete).
  const demoEmails = ["customer@demo.evgosmart.test", "driver@demo.evgosmart.test", "dispatcher@demo.evgosmart.test", "admin@demo.evgosmart.test"];
  for (const email of demoEmails) {
    await sql`delete from auth.users where email = ${email}`;
  }
  console.log("Demo reset complete.");
  await sql.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
