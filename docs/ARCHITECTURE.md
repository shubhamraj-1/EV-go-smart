# Architecture — EVgoSmart

**Status:** Draft v2 · **Last updated:** 5 Nov 2026
**Shape:** one Next.js modular monolith, one Supabase Postgres database, managed services for maps, realtime, email, and payments.

---

## 1. Summary

```
Browser (React 19 / Next.js 16)
   │
   ├── Server Components / Server Actions ──┐
   ├── Route Handlers /api/v1/* ────────────┤
   │                                        ▼
   │                              Service layer (authz + domain rules)
   │                                        │
   │          ┌─────────────────────────────┼──────────────────────┐
   │          ▼                             ▼                      ▼
   │   Supabase Postgres              Supabase Auth          Supabase Realtime
   │   (Drizzle, PostGIS, RLS)        (sessions, OAuth, MFA) (private channels)
   │          │
   │          ├── Google Maps (maps / ETA)
   │          ├── Razorpay (test)
   │          └── Resend (email)
   └── Vercel (hosting, cron, previews)
```

**Key principle:** the browser never queries tables. Every read and write goes through a server-side service that authenticates the session, authorizes the action, validates input, and writes an audit record when required. Supabase's public API also exposes PostgREST, so RLS is enabled on every table as a second layer for the browser-facing surface (mainly Auth and Realtime). The service layer remains the primary boundary.

## 2. Stack

| Layer | Choice | Version / notes |
| --- | --- | --- |
| Framework | Next.js (App Router) | 16.4.5, React 19.3.1, TypeScript strict |
| Styling | Tailwind CSS + shadcn-style primitives | Tailwind 4.3.4, CSS-first tokens |
| Database | Supabase Postgres (Mumbai) | Free tier for demo, Pro for production |
| Query layer | Drizzle ORM + `postgres.js` | drizzle-orm 0.45.x, postgres 3.4.x |
| Auth | Supabase Auth + `@supabase/ssr` | Sessions, Google OAuth, TOTP MFA, recovery codes |
| Validation | Zod | 4.6.x, schemas shared by client/server |
| Geo | PostGIS | `geography(Point,4326)`, GiST, `ST_DWithin` |
| Maps | Google Maps Platform | Maps JS, Places (New), Directions, Geocoding |
| Realtime | Supabase Realtime | Private Broadcast channels + RLS, polling fallback |
| Payments | Razorpay | Test mode, Checkout + webhooks |
| Email | Resend + React Email | Supabase Auth uses Resend SMTP |
| Hosting | Vercel | Hobby for demo, Pro for commercial |
| CI | GitHub Actions | lint, typecheck, tests, CodeQL |
| Errors | Sentry (optional) | free developer tier |
| Package manager | pnpm | lockfile committed |

> Versions checked on 5 Nov 2026. Pin exact versions in `package.json` and update deliberately.

## 3. Repository shape

```
evgosmart/
├── app/
│   ├── (marketing)/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── (auth)/
│   ├── (customer)/
│   ├── (driver)/
│   ├── (ops)/
│   ├── (admin)/
│   ├── api/
│   │   ├── auth/[...all]/route.ts
│   │   ├── v1/.../route.ts
│   │   └── webhooks/razorpay/route.ts
│   ├── layout.tsx
│   ├── not-found.tsx
│   ├── globals.css
│   └── proxy.ts                  # Next.js 16 route protection (optimistic only)
├── modules/
│   ├── auth/                     # requireSession, role guards, aal checks
│   ├── users/
│   ├── vehicles/
│   ├── vans/
│   ├── dispatch/
│   ├── bookings/
│   ├── payments/
│   ├── notifications/
│   ├── realtime/                 # channel names + publish helper
│   ├── maps/                     # geocoding, places, directions, ETA
│   ├── audit/
│   └── demo/
├── components/
│   ├── ui/
│   ├── blocks/
│   ├── maps/
│   └── layouts/
├── lib/
│   ├── db/                       # Drizzle client + schema
│   ├── supabase/                 # browser, server, middleware clients
│   ├── auth/                     # session helpers
│   ├── env.ts
│   ├── errors.ts
│   ├── logger.ts
│   ├── rate-limit.ts
│   ├── money.ts
│   └── utils.ts
├── supabase/
│   ├── migrations/               # tables, RLS, functions, extensions
│   └── config.toml
├── emails/
├── scripts/
├── tests/
├── docs/
├── public/
├── .env.example
├── AGENTS.md
├── opencode.jsonc
└── package.json
```

### Why a modular monolith

- One deployment, one database, one auth system: the fastest safe path for a solo 6–8 week MVP.
- Domain modules keep boundaries clear. If the product later splits into a driver app or a separate dispatch service, the module already has a service interface.
- `components/blocks/` is the reusable layer. Blocks are presentational and receive data via props; they never fetch or authorize.
- Do not create a package-per-module or a Turborepo until a second app actually exists.

## 4. Module boundaries

| Module | Owns | Must not |
| --- | --- | --- |
| `auth` | Session lookup, role guards, MFA/aal policy, auth pages | Contain booking business rules |
| `users` | Profile, role changes, ban/unban, admin user list | Touch payments |
| `vehicles` | Customer EV records, ownership checks | Assign vans |
| `vans` | Van records, status, capacity, driver assignment | Decide dispatch ranking |
| `dispatch` | Candidate search, ETA ranking, assignment/reassignment | Charge the customer |
| `bookings` | Booking lifecycle, status machine, history, ratings | Call Razorpay directly |
| `payments` | Razorpay orders, verification, webhooks, refunds | Change booking status outside the state machine |
| `notifications` | Email templates, send queue, delivery records | Decide business state |
| `realtime` | Channel names, publish helpers, payload DTOs | Be the source of truth |
| `maps` | Geocoding, places, directions, ETA provider abstraction | Store customer location beyond the booking |
| `audit` | Append-only audit records, redaction | Be editable by admins |
| `demo` | Seed/reset, simulation controls | Run in production |

Dependency direction: `app → modules → lib`. Modules may call each other through explicit service functions, never through deep imports of another module's internals.

## 5. Data model

All timestamps are `timestamptz` in UTC. Money is integer paise. Locations are PostGIS `geography(Point,4326)`. Every table has `enable row level security`.

### Enumerations (as CHECK constraints)

- `role`: `customer | driver | dispatcher | admin`
- `booking_status`: `requested | assigned | en_route | arrived | charging | completed | cancelled | expired | failed`
- `payment_status`: `not_required | pending | paid | failed | refunded | partially_refunded`
- `van_status`: `offline | available | assigned | en_route | charging | returning | maintenance`

### Core tables

```sql
-- One row per Auth user. Never store a role in user_metadata.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer'
    check (role in ('customer','driver','dispatcher','admin')),
  full_name text not null,
  phone text,
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  make text not null,
  model text not null,
  year smallint not null,
  connector_type text not null
    check (connector_type in ('CCS2','CHAdeMO','Type2','Other')),
  battery_kwh numeric(6,2) not null,
  license_plate text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vehicles_user_idx on vehicles (user_id, created_at desc);
create unique index vehicles_plate_idx on vehicles (user_id, license_plate);

create table driver_profiles (
  user_id uuid primary key references profiles (id) on delete cascade,
  phone text not null,
  license_number text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','suspended')),
  rating numeric(2,1) not null default 5.0,
  total_trips integer not null default 0,
  current_van_id uuid,
  status text not null default 'offline'
    check (status in ('offline','available','busy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index driver_profiles_status_idx on driver_profiles (status);

create table vans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  driver_id uuid references profiles (id),
  status text not null default 'offline'
    check (status in ('offline','available','assigned','en_route','charging','returning','maintenance')),
  connector_types text[] not null,
  capacity_kwh numeric(6,2) not null,
  current_kwh numeric(6,2) not null,
  location geography(Point,4326) not null,
  location_updated_at timestamptz not null default now(),
  city text not null,
  rating numeric(2,1) not null default 5.0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vans_location_gix on vans using gist (location);
create index vans_status_city_idx on vans (status, city);
create index vans_driver_idx on vans (driver_id);

create sequence booking_ref_seq;

create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references profiles (id),
  vehicle_id uuid not null references vehicles (id),
  van_id uuid references vans (id),
  driver_id uuid references profiles (id),
  status text not null default 'requested'
    check (status in ('requested','assigned','en_route','arrived','charging','completed','cancelled','expired','failed')),
  location geography(Point,4326) not null,
  address text not null,
  battery_percent smallint not null check (battery_percent between 0 and 100),
  connector_type text not null
    check (connector_type in ('CCS2','CHAdeMO','Type2','Other')),
  notes text,
  base_fee_paise integer not null check (base_fee_paise >= 0),
  per_kwh_paise integer not null check (per_kwh_paise > 0),
  estimated_kwh numeric(6,2) not null,
  estimated_total_paise integer not null check (estimated_total_paise > 0),
  delivered_kwh numeric(6,2) check (delivered_kwh >= 0),
  final_total_paise integer check (final_total_paise > 0),
  completed_at timestamptz,
  payment_status text not null default 'pending'
    check (payment_status in ('not_required','pending','paid','failed','refunded','partially_refunded')),
  dispatch_attempts integer not null default 0,
  assigned_at timestamptz,
  eta_minutes integer,
  eta_updated_at timestamptz,
  rating_score smallint check (rating_score between 1 and 5),
  rating_comment text,
  rating_created_at timestamptz,
  cancel_reason text,
  cancelled_by uuid references profiles (id),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_customer_idx on bookings (customer_id, created_at desc);
create index bookings_driver_idx on bookings (driver_id, created_at desc);
create index bookings_status_idx on bookings (status, created_at desc);
create index bookings_van_status_idx on bookings (van_id, status);
create unique index bookings_idem_idx
  on bookings (customer_id, idempotency_key)
  where idempotency_key is not null;

create table booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references bookings (id) on delete cascade,
  type text not null,
  from_status text,
  to_status text,
  actor_id uuid references profiles (id),
  actor_role text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on booking_events (booking_id, created_at);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  provider text not null default 'razorpay',
  order_id text not null unique,
  payment_id text unique,
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',
  status text not null default 'created'
    check (status in ('created','authorized','captured','failed','refunded')),
  method text,
  receipt text not null,
  notes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on payments (booking_id);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null unique,
  type text not null,
  payload_hash text not null,
  status text not null default 'processed'
    check (status in ('processed','ignored','failed')),
  processed_at timestamptz not null default now()
);
```

### Supporting tables

| Table | Purpose | Key constraint |
| --- | --- | --- |
| `driver_locations` | Location pings, 30-day retention | `geography` point, indexes on `(van_id, created_at)` and `created_at` |
| `notifications` | Email/in-app delivery records | `(user_id, created_at desc)`, `status` |
| `audit_logs` | Append-only privileged actions | `(created_at desc)`, `(actor_id, created_at)`, `(resource_type, resource_id)` |
| `rate_limits` | Fixed-window counters | `key` unique; `reset_at` |
| `pricing_rules` | Per-city pricing | `(city, active)` |
| `service_areas` | City polygons | `geography(MultiPolygon,4326)` + GiST |
| `app_settings` | Dispatch radius, feature flags | `key` unique |

### Conventions

- Money is `integer` paise; never `numeric`/`float` for currency.
- Enumerations are `text` + `CHECK` so a migration can extend them without enum ordering issues.
- Booking pricing and dispatch fields are columns (queryable, constrained); free-form metadata is `jsonb`.
- Never return a raw row to the client. Map to a DTO with Zod or an explicit serializer.
- Pagination: cursor by `(created_at, id)`, max page size 50.
- Transactions: `db.transaction()` for assignment + booking update and payment + booking update.
- Migrations live in `supabase/migrations/` and are applied with `supabase db push` (or Drizzle Kit in CI). Never edit a table in the dashboard for anything that must reach production.
- `updated_at` is maintained by a trigger, not by application code.

### Row Level Security

RLS is the second layer, not the first. The server connects with the database owner/secret key and bypasses RLS; the publishable key from a browser is subject to it.

```sql
create function public.actor_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table bookings enable row level security;

create policy "customers read own bookings" on bookings
  for select to authenticated
  using (customer_id = auth.uid());

create policy "drivers read assigned bookings" on bookings
  for select to authenticated
  using (driver_id = auth.uid());

create policy "ops read bookings" on bookings
  for select to authenticated
  using (
    public.actor_role() = 'admin'
    or (
      public.actor_role() = 'dispatcher'
      and status in ('requested','assigned','en_route','arrived','charging')
    )
  );
```

Rules:

- Every migration that creates a table also enables RLS and adds its policies.
- `actor_role()` is `security definer` and reads `profiles`; never trust a role claim written by a user.
- Admin-only tables add `and (select auth.jwt()->>'aal') = 'aal2'` as a restrictive policy.
- `driver_locations` is readable only by the assigned customer/driver and ops; no client writes.
- Audit logs: select/insert only; `update`/`delete` are revoked from `authenticated`.

## 6. Dispatch design

### Candidate search

1. Validate the request: customer owns the vehicle, connector matches, battery 0–100, location inside an active service area.
2. Query vans with PostGIS:

```sql
select id, code, st_distance(location, $1::geography) as metres
from vans
where status = 'available'
  and active
  and $2 = any (connector_types)
  and current_kwh >= $3
  and st_dwithin(location, $1::geography, $4)
order by location <-> $1::geography
limit 3;
```

3. Ask the `EtaProvider` for road ETA via Google Directions/Distance Matrix; cache per van/customer pair for 60 seconds.
4. Rank by ETA, then remaining capacity, then rating.
5. Attempt atomic assignment inside a transaction:

```sql
update vans set status = 'assigned', updated_at = now()
where id = $1 and status = 'available'
returning id;
```

If no row is returned, try the next candidate.
6. Set booking `assigned`, write `booking_events`, publish `booking.assigned`, send email.
7. Driver has 60 seconds to accept. If not, release the van and reassign.
8. If no candidate: booking stays `requested`, dispatcher sees an exception, retry every 30 seconds for 5 minutes, then `expired`.

### Reassignment

- Dispatcher can reassign at any active state before `charging`.
- Release the old van (`available`), assign the new van, write an audit event, notify both drivers and the customer.
- Reassignment during `en_route` requires a reason and is audited.

### ETA and location

- Driver location is sent to the server every 10 seconds while on an active job; the server validates the assignment, writes `driver_locations`, updates the van's last known location, and publishes to a private channel.
- ETA is refreshed every 60 seconds from the server, not on every location ping.
- Customer sees the assigned van only. Dispatcher sees all vans.
- `driver_locations` rows older than 30 days are deleted by `pg_cron` at 03:00 daily.

### Simulation mode

Vercel serverless functions cannot run a continuous simulation loop. The demo uses:

- Client-side interpolation for smooth van movement on the map.
- A dispatcher/admin **Simulation** panel with explicit "advance" actions that call real APIs and publish real events.
- Optional scheduled tick from GitHub Actions (every 5 minutes) to progress demo bookings; not required for the core demo.

## 7. Auth and session design

- **Supabase Auth** with `@supabase/ssr`; `getUser()` on the server, never `getSession()` for authorization.
- Providers: email/password + Google OAuth.
- Email verification required for customers before booking. Google accounts are considered verified.
- Password policy: minimum 12 characters, maximum 128. Supabase's leaked-password protection is a Pro feature, so the sign-up action calls the HIBP k-anonymity API.
- Sessions are HTTP-only cookies managed by `@supabase/ssr`; access tokens are short-lived and refreshed by middleware.
- Roles live in `public.profiles.role`. A custom access-token hook adds `user_role` to the JWT for RLS; the server re-reads the role from the database for every authorization decision.
- **MFA:** TOTP + recovery codes. Admin routes require `aal2`; a user with the admin role but `aal1` is redirected to enrollment and blocked from admin data.
- **Revocation:** ban via the admin API; `profiles.session_version` is bumped on ban, role change, and password reset. `requireSession()` rejects a JWT whose `session_version` claim is stale.
- **OAuth linking:** only link accounts when the provider reports a verified email.
- `proxy.ts` only does optimistic redirects based on cookie presence. Every page and route handler performs a real `getUser()` + profile check.
- Trusted origins: `NEXT_PUBLIC_APP_URL`, the Vercel preview URL, and `http://localhost:3000`.

See `docs/SECURITY.md` for the full RBAC matrix and threat model.

## 8. API design

- Route handlers live under `app/api/v1/`.
- Server Components call the service layer directly for initial data.
- Client components call route handlers for mutations and live data.
- All input is parsed with Zod. All output is a DTO, not a raw row.
- Every protected route calls `requireSession()` and then a resource-level guard.
- Error shape:

```json
{
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "Booking not found.",
    "requestId": "req_01..."
  }
}
```

- `Idempotency-Key` is required for `POST /bookings` and `POST /payments/order`. Store the key with the response for 24 hours.

### Endpoint map

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/me` | any | Session + profile |
| `PATCH` | `/api/v1/me` | any | Update name/phone |
| `GET/POST` | `/api/v1/vehicles` | customer | List/create vehicles |
| `PATCH/DELETE` | `/api/v1/vehicles/:id` | customer (owner) | Update/delete |
| `POST` | `/api/v1/bookings` | customer | Create request |
| `GET` | `/api/v1/bookings` | scoped | List own/assigned/all |
| `GET` | `/api/v1/bookings/:id` | scoped | Detail |
| `POST` | `/api/v1/bookings/:id/cancel` | customer/dispatcher/admin | Cancel |
| `POST` | `/api/v1/bookings/:id/accept` | assigned driver | Accept job |
| `POST` | `/api/v1/bookings/:id/decline` | assigned driver | Decline job |
| `POST` | `/api/v1/bookings/:id/status` | assigned driver/dispatcher | Validated transition |
| `POST` | `/api/v1/bookings/:id/assign` | dispatcher/admin | Manual assign/reassign |
| `POST` | `/api/v1/bookings/:id/complete` | assigned driver | kWh + complete |
| `POST` | `/api/v1/bookings/:id/rate` | customer (owner) | Rating |
| `GET` | `/api/v1/ops/queue` | dispatcher/admin | Live queue |
| `GET` | `/api/v1/ops/vans` | dispatcher/admin | Fleet snapshot |
| `POST` | `/api/v1/driver/location` | driver | Location ping |
| `POST` | `/api/v1/driver/availability` | driver | Online/offline |
| `POST` | `/api/v1/payments/order` | customer (owner) | Create Razorpay order |
| `POST` | `/api/v1/payments/verify` | customer (owner) | Verify checkout signature |
| `POST` | `/api/webhooks/razorpay` | public | Signed webhook |
| `GET/POST` | `/api/v1/admin/users` | admin | User management |
| `POST` | `/api/v1/admin/users/:id/role` | admin | Role change |
| `GET` | `/api/v1/admin/audit` | admin | Audit log |
| `POST` | `/api/v1/admin/demo/reset` | admin (demo only) | Reset demo data |

There is no realtime token endpoint: Supabase issues the session JWT and Realtime authorises channels against it.

## 9. Realtime design (Supabase)

### Channels

| Channel | Subscribers | Publisher | Authorization |
| --- | --- | --- | --- |
| `booking:{bookingId}` | customer, assigned driver, dispatcher, admin | server | RLS on `realtime.messages` |
| `van:{vanId}:location` | assigned customer, dispatcher, admin | server | RLS on `realtime.messages` |
| `driver:{driverId}:jobs` | that driver | server | RLS on `realtime.messages` |
| `dispatch:queue` | dispatcher, admin | server | role + `aal2` for admin |

### How it works

- Channels are **private**. Clients call `supabase.realtime.setAuth(jwt)` and subscribe; they never publish.
- Server-side publish goes through Supabase's HTTP broadcast API with the secret key, so it works from Vercel serverless functions without holding a socket.
- RLS policies on `realtime.messages` map a JWT to the channels it may read. A customer can only read `booking:{ownBookingId}` and `van:{assignedVanId}:location`.
- Payloads are minimal DTOs with no PII: booking ID, status, ETA, and public driver/van fields. Phone numbers and coordinates are fetched through the API, not broadcast.
- Use Broadcast, not Postgres Changes: changes ship full rows, which risks leaking phone numbers and precise coordinates.

### Events

```ts
type RealtimeEvent =
  | { type: 'booking.created'; bookingId: string }
  | { type: 'booking.assigned'; bookingId: string; driver: PublicDriver; van: PublicVan; etaMinutes: number }
  | { type: 'booking.status_changed'; bookingId: string; status: BookingStatus; at: string }
  | { type: 'booking.payment_updated'; bookingId: string; paymentStatus: PaymentStatus }
  | { type: 'van.location'; vanId: string; lat: number; lng: number; heading?: number; at: string }
  | { type: 'dispatch.queue_updated'; at: string };
```

### Fallback

- `useBooking` and `useDispatchQueue` use SWR.
- If the Realtime connection is `closed` or `errored` for more than 15 seconds, polling starts at 10 seconds (booking) / 15 seconds (queue).
- Realtime is an enhancement, never the source of truth. The database is.

## 10. Maps and geo

- **Browser key:** Maps JavaScript API + Places API (New), restricted by HTTP referrer (localhost, Vercel domains).
- **Server key:** Directions API, Geocoding API, Distance Matrix API; server-only, API-restricted, quota-capped. Never prefix with `NEXT_PUBLIC_`.
- Use `@vis.gl/react-google-maps` for the map, markers, and directions renderer.
- Address input uses Places Autocomplete (New) with session tokens.
- Reverse geocode the browser location to a human-readable address.
- ETA uses Directions/Distance Matrix for the top 3 candidates only. Cache for 60 seconds.
- Pre-filter candidates with PostGIS before calling Google.
- Quotas and budget alerts are mandatory. Google Maps requires a billing account even within the free usage tier.
- Do not send precise coordinates to analytics. Google Maps receives them for map/routing as a data processor; disclose this in the privacy policy.

## 11. Payments (Razorpay)

1. Driver completes the job with delivered kWh.
2. Server computes the final amount from the active pricing rule.
3. Customer taps **Pay now**.
4. Server creates a Razorpay order (`amount` in paise, `currency: INR`, `receipt: booking.reference`, notes with booking ID). Store a `payments` row with status `created`.
5. Client opens Razorpay Checkout with the order ID and the public key.
6. On success, client sends `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature` to `/api/v1/payments/verify`.
7. Server verifies the HMAC signature, fetches the payment, checks amount/currency/order, and updates the payment and booking in a transaction.
8. Razorpay webhook `payment.captured` is the source of truth. Verify `X-Razorpay-Signature` against the raw body, check `webhook_events.event_id` for idempotency, then update.
9. Refunds are manual in v1; record an audit event and update payment status.

Never store card numbers, CVV, or full payment instrument data. Razorpay Checkout is hosted.

## 12. Email (Resend)

- Provider abstraction: `EmailProvider` with `ResendProvider`, `ConsoleProvider` (local), and an optional fallback.
- Templates live in `emails/` and are built with React Email.
- Every send writes a `notifications` row with template, recipient, provider ID, status, and error.
- Supabase Auth uses Resend via **custom SMTP** (`smtp.resend.com`), so verification and reset emails share the same provider and are not subject to Supabase's built-in email rate limit.
- Resend free tier: 3,000/month, 100/day, no overage. Monitor the daily count.
- A verified domain is required for production deliverability. For the demo, send only to the developer's verified address or use console logging.
- Local development: `pnpm emails:dev`; `ConsoleProvider` logs the rendered HTML.
- Bounce/complaint webhooks are logged; suppression is post-MVP.

## 13. Demo data and simulation

- Separate Supabase project for the demo. Never seed the production project.
- `DEMO_MODE=true` shows a persistent banner: **Demo environment — simulated fleet, test payments**.
- Seed script uses a fixed seed (`EVGO_DEMO_SEED=42`) and idempotent upserts.
- Seeds: 1 admin, 1 dispatcher, 3 drivers, 6 customers, 8 vehicles, 3 vans, 30 bookings over 30 days, 3 active bookings, payments, ratings, notifications.
- Demo users are created through the Auth admin API (`auth.admin.createUser`) with `email_confirm: true`, then `profiles` rows are inserted with roles.
- `scripts/reset-demo.ts` refuses unless `DEMO_MODE === 'true'` **and** the Supabase project ref is on the demo allowlist. It truncates app tables; it never drops the Auth schema.
- Simulation panel: advance status, move van, trigger no-van, trigger payment failure.
- Production build must not import the demo module; guard with `DEMO_MODE`.

## 14. Environments and deployment

| Environment | Database | Keys | Data | Purpose |
| --- | --- | --- | --- | --- |
| `local` | Supabase CLI in Docker | test | seed/fixtures | Development |
| `preview` | demo project (shared) or no DB | test | seed | PR review |
| `demo` | Supabase demo project | test | seeded demo | Internship demo |
| `production` | Supabase production project | live | real | Future launch |

- Supabase region: Mumbai (`ap-south-1`).
- Runtime uses the **transaction pooler** (port 6543) with `prepare: false` and a small pool; migrations use the direct connection (port 5432).
- Vercel functions run close to Mumbai where available.
- Vercel Cron: one daily job for retention/cleanup. The job also keeps the free Supabase project active.
- Preview deployments use test keys and never the production project.
- Free plan allows 2 active projects: local runs in Docker, the cloud project is the demo.

## 15. Observability

- Structured JSON logs with `requestId`, route, status, duration, and user ID hash. Never log tokens, passwords, full emails in bulk, or precise coordinates.
- Sentry (optional free tier) for server and client exceptions; scrub PII.
- Audit log for privileged actions: role changes, bans, reassignments, refunds, manual status overrides, pricing changes, demo resets.
- Metrics to watch: booking creation rate, assignment latency, no-van rate, payment success, email failures, Realtime connection failures, Google Maps quota usage, Supabase database size and connection count.
- Alerts: 5xx spike, auth failure spike, webhook verification failure, Supabase storage > 80%, Resend daily cap > 80, Realtime failures > 10%.

## 16. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Unit | Vitest | State machine, pricing, Zod schemas, auth guards, redaction |
| Integration | Vitest + local Supabase Postgres | Repositories, PostGIS search, assignment atomicity, payment webhook |
| RLS | pgTAP or SQL fixtures | Customer A cannot read customer B; driver scope; admin `aal2` |
| E2E | Playwright | Signup/login, request, dispatch, driver statuses, payment mock, history, RBAC |
| Security | Playwright + custom | IDOR, role escalation, rate limit, webhook signature, SQL injection |
| Accessibility | axe-core | Key pages, keyboard flow |
| Load | k6 (optional) | Dispatch search with 100 vans; booking creation |

CI runs lint, typecheck, unit, integration, build, and E2E on the critical path. Security changes require the `review-security` skill before merge.

## 17. Performance and limits

- Supabase free: 500 MB database, shared CPU, 500 MB RAM, 200 Realtime connections, 2M messages/month.
- Keep queries indexed; no unbounded scans. Use `EXPLAIN` for the dispatch query.
- Real-time: location every 10s per active van; pause when the tab is hidden; throttle to 1 update/5s minimum.
- Google Maps: only top 3 ETA calls; cache 60s; debounce address search.
- Vercel: cold starts; lazy-load the map with `next/dynamic` and `ssr: false`; avoid shipping the Google Maps SDK on the landing page.
- Pagination everywhere; max 50 rows.
- Images: `next/image`; no user uploads in v1.
- Use React Server Components for read-heavy pages; client components only for maps, realtime, forms, and interactive tables.

## 18. Free tiers vs production

| Service | Demo (free) | Limit | Production upgrade |
| --- | --- | --- | --- |
| Supabase | Free | 500 MB DB, 2 projects, pauses after 7 days idle, no backups, 2M Realtime msgs/mo | Pro ~$25/mo (backups, no pause) |
| Vercel | Hobby | Non-commercial, function limits | Pro $20/user/mo |
| Google Maps | Free quota | Requires billing account; per-SKU caps | Pay-as-you-go + budget caps |
| Razorpay | Test mode | No live charges | Live mode after KYC + fees |
| Resend | Free | 3,000/mo, 100/day | Pro $20/mo |
| Domain | `*.vercel.app` | Free subdomain | ~₹800–1,500/year |
| Sentry | Developer | 5k errors/mo | Team plan |

The **code** can be production-ready while the **infrastructure** starts on free tiers. The go-live checklist in `docs/SECURITY.md` lists the minimum upgrades before real customer data.

## 19. Architecture decisions (ADR summary)

| # | Decision | Why | Revisit when |
| --- | --- | --- | --- |
| 001 | Modular monolith over microservices | Solo team, 6–8 weeks, one deploy | Second app or separate ops team |
| 002 | Supabase Postgres over MongoDB | Relational integrity for payments/audit, PostGIS, one vendor | Reporting needs a warehouse, or scale exceeds Postgres |
| 003 | Supabase Auth over custom auth | Managed sessions, OAuth, TOTP, recovery codes, `aal` | Vendor lock-in or an unsupported provider |
| 004 | Supabase Realtime over Ably | One vendor, RLS-authorised private channels, no token endpoint | >200 concurrent connections or >2M messages/month |
| 005 | Google Maps over Mapbox | Best India coverage; user choice | Cost or quota becomes a problem |
| 006 | Razorpay test mode | India-first, hosted checkout, no card data | Live KYC available |
| 007 | Resend over SMTP | React Email DX, free tier, API | Deliverability or volume issues |
| 008 | Service layer + RLS | PostgREST is public by default; RLS is the second layer | Never remove both |
| 009 | Separate demo project | Prevents demo data leaking into production | Never |
| 010 | Client-driven simulation | Vercel serverless cannot run a loop | Real telematics or a worker |
| 011 | Drizzle over `supabase-js` for queries | Typed SQL, real transactions, migrations | Supabase adds a feature Drizzle cannot reach |
