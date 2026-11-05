# Demo script (3 minutes)

1. **0:00–0:20 — Problem.** Landing: "Range anxiety is a safety problem; EVgoSmart brings the charger to the driver."
2. **0:20–0:50 — Customer.** Sign in as `customer@demo.evgosmart.test`, add vehicle, request charge, show price estimate.
3. **0:50–1:20 — Dispatcher.** `dispatcher@demo.evgosmart.test` — queue, auto-assign, ETA, audit trail.
4. **1:20–2:00 — Driver.** `driver@demo.evgosmart.test` — accept, en_route → arrived → charging, enter kWh, complete. Customer page updates live (10s polling).
5. **2:00–2:30 — Payment.** Customer pays Razorpay test; receipt + payment status; "no card data touches our servers."
6. **2:30–2:50 — Security.** Second customer gets 404 on the booking; audit log; admin MFA.
7. **2:50–3:00 — Close.** "Demo fleet simulated; architecture ready for real GPS and live payments."

## Architecture / security summary (1 page)

- **Stack:** Next.js 16 (App Router) + React 19, Supabase Postgres (PostGIS, RLS) + Drizzle ORM, Supabase Auth, Razorpay test, Resend email, Google Maps, Vercel.
- **Authorization:** server-only `Actor` + role read from DB; every route checks role + ownership; IDOR → 404. RLS second layer.
- **Payments:** server computes paise amount; hosted Checkout; HMAC verify + webhook idempotency (`webhook_events.event_id`); webhook is source of truth.
- **Location privacy:** only assigned driver/customer see precise coords; 30-day retention; no coords in logs/audit metadata.
- **Audit:** role changes, reassignments, manual overrides, refunds — append-only.
- **Demo honesty:** `DEMO_MODE` banner, simulated fleet label, test-payment disclaimer, seed/reset guards.
