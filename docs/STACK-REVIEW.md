# Stack Review — MongoDB vs Supabase, and the rest

**Status:** Decision requested · **Date:** 5 Nov 2026
**Question:** Can Supabase replace MongoDB, and can the stack be compressed before we start building?

---

## 1. TL;DR

1. **There is no Supabase in the current plan.** The docs use MongoDB Atlas + Mongoose + Better Auth + Ably. Supabase was never part of it — you may be thinking of another project.
2. **MongoDB is not required.** Nothing in EVgoSmart needs a document database. Every requirement that pushed us toward MongoDB has a clean Postgres equivalent.
3. **Recommended: switch to Supabase** — Postgres + Auth + Realtime in one project. MongoDB, Better Auth, and Ably collapse into Supabase: **6 required services → 5**, and we stop owning session, verification, OAuth, MFA, and realtime-transport plumbing.
4. **Keep:** Next.js 16, React 19, Tailwind 4, Zod, Google Maps, Razorpay test mode, Resend, Vercel.
5. **The honest trade-off:** Supabase's free project pauses after 7 days of inactivity, has no backups, and RLS policies take a day to learn. All three are mitigable; the pause is fully solvable with the daily cron we already need.
6. **Timing is ideal.** Zero application code exists. The switch costs ~1–2 days of docs and schema work, offset almost exactly by the auth/realtime code we no longer write.

---

## 2. What the current stack actually is

| Layer | Choice | External service? | Free tier | Card required? |
| --- | --- | --- | --- | --- |
| Framework | Next.js 16.4.5, React 19.3.1 | Vercel | Hobby | No |
| Language | TypeScript 7.0.2 (strict) | — | — | — |
| Styling | Tailwind 4.3.4 + shadcn-style primitives | — | — | — |
| Database | MongoDB Atlas M0 + Mongoose 9 | Atlas | 512 MB, ~100 ops/s, no backups | No |
| Auth | Better Auth 1.7 + Mongo adapter | — (self-hosted library) | — | — |
| Realtime | Ably 2.30 | Ably | 6M msgs/mo, 200 connections | No |
| Maps | Google Maps Platform | Google | Monthly free usage per SKU | **Yes** |
| Payments | Razorpay (test) | Razorpay | Test mode free | No |
| Email | Resend | Resend | 3,000/mo, 100/day | No |
| Errors | Sentry (optional) | Sentry | 5k errors/mo | No |

**Vendors today: 6 required** (Vercel, Atlas, Ably, Google, Razorpay, Resend) **+ Sentry optional**, plus two subsystems we own end-to-end: Better Auth and the Mongoose data layer.

---

## 3. Why MongoDB was chosen — and whether it still holds

The architecture doc's reasons: flexible booking documents, geospatial indexes, TTL for location pings, and transactions on M0.

| Requirement | MongoDB | Postgres / Supabase | Verdict |
| --- | --- | --- | --- |
| Variable booking shape | Nested `estimate`, `final`, `dispatch` | Explicit columns + `jsonb` for free-form metadata | **Postgres is fine** — our schema is known and stable; money must be explicit columns anyway |
| Find nearby vans | `2dsphere` + `$nearSphere` | PostGIS `geography(Point,4326)` + GiST + `ST_DWithin` | **PostGIS is better** — metres, great-circle, KNN ordering |
| 30-day location retention | TTL index (zero code) | `pg_cron` nightly delete | **Mongo is slightly simpler**, Postgres is fine |
| Atomic assignment | `findOneAndUpdate({status:'available'})` | `UPDATE … WHERE status='available' RETURNING` | **Equal** |
| Booking + payment transaction | Sessions (works on M0) | Native ACID | **Postgres is better** |
| Referential integrity | Manual | Foreign keys | **Postgres is better** — a payment or event cannot orphan a booking |
| Reporting (revenue, kWh, SLA) | Aggregation pipeline | SQL joins, views, `GROUP BY` | **Postgres is better** |
| Ad-hoc schema change | Easy | Migration | **Mongo is easier**, but our schema is not actually ad-hoc |

**Conclusion:** the only real MongoDB advantages here are TTL indexes and schema flexibility. We do not need schema flexibility — the data model is already fully specified in `docs/ARCHITECTURE.md`. Postgres is the better fit for a product whose sensitive parts are money, audit trails, and access control.

---

## 4. What "compress" should mean

Three different axes, often confused:

1. **Fewer vendors** — fewer accounts, keys, dashboards, quotas, and failure modes.
2. **Less code we own** — sessions, OAuth callbacks, MFA, token issuance, email verification.
3. **Fewer concepts** — one database, one auth model, one realtime model.

The current stack is not bad, but it scores poorly on (1) and (2): Atlas for data, Better Auth for sessions, Ably for transport. Two vendors plus an auth subsystem we own, each with its own keys, quotas, and failure mode.

---

## 5. Candidate stacks

### A — Current: Mongo + Better Auth + Ably

```
Next.js → service layer → MongoDB Atlas (Mongoose)
                        → Better Auth (sessions in Mongo)
                        → Ably (server publishes, token endpoint)
```

- **Services:** Vercel, Atlas, Ably, Google, Razorpay, Resend = 6 (+ Sentry optional).
- **We own:** session lifecycle, OAuth callbacks, email verification tokens, MFA enrollment, Ably token capabilities, Mongoose models, index sync.
- **Pros:** every doc is already written for it; Atlas M0 never pauses; Ably is the most robust realtime option.
- **Cons:** the most custom security code; no joins/foreign keys; auth and realtime are extra subsystems to build, test, and secure.

### B — Supabase-native (recommended)

```
Next.js → service layer → Supabase Postgres (Drizzle + postgres.js)
                        → Supabase Auth (sessions, OAuth, MFA)
                        → Supabase Realtime (private channels, RLS)
```

- **Services:** Vercel, Supabase, Google, Razorpay, Resend = **5**.
- **We own:** domain services, schema, RLS policies, dispatch logic, payments.
- **Pros:** one vendor for data + auth + realtime; Postgres integrity; RLS as a second layer for the browser-facing realtime surface; less bespoke auth code; Supabase Storage is there later for driver documents (not in v1).
- **Cons:** free project pauses after 7 days of inactivity; no backups on free; RLS has a learning curve; BaaS coupling must be contained behind a repository layer.

### C — Lean Postgres: Neon + Drizzle + Better Auth + Ably

```
Next.js → service layer → Neon Postgres (Drizzle)
                        → Better Auth (sessions in Postgres)
                        → Ably
```

- **Services:** Vercel, Neon, Ably, Google, Razorpay, Resend = 6.
- **Pros:** relational integrity without a BaaS; Neon auto-resumes (no pause risk), no card; keeps the "we own auth" story; no RLS to learn.
- **Cons:** still two vendors plus an auth subsystem; the same session, verification, and realtime plumbing to build; the least compression of the three.

### Comparison

| | A · Mongo | B · Supabase | C · Neon |
| --- | --- | --- | --- |
| External services | 6–7 | **5** | 6 |
| Database | MongoDB M0 | Supabase Postgres | Neon Postgres |
| Auth | Better Auth | Supabase Auth | Better Auth |
| Realtime | Ably | Supabase Realtime | Ably |
| Query layer | Mongoose | Drizzle + supabase-js | Drizzle |
| Geo search | 2dsphere | PostGIS | PostGIS |
| Retention | TTL index | pg_cron | pg_cron |
| Row-level security | No | **Yes** | No |
| MFA built in | Plugin | **Yes (TOTP)** | Plugin |
| Free-tier pause risk | No | **Yes (mitigable)** | No (auto-resume) |
| Backups on free | No | No | No |
| Card required | Google only | Google only | Google only |
| Custom auth code | High | **Low** | High |
| Main risk | security code volume | vendor coupling + RLS | vendor count |

---

## 6. Head-to-head on each layer

### 6.1 Database — Supabase Postgres

**Yes, switch.** Postgres is a better fit for bookings, payments, audit events, and RBAC:

- Foreign keys stop orphaned payments and events.
- Native transactions for `assignment + booking` and `payment + booking` — the two flows `AGENTS.md` explicitly requires to be atomic.
- `bigint`/`integer` paise columns with `CHECK (amount_paise > 0)` constraints — the database itself rejects float money.
- PostGIS is more accurate than `2dsphere` for "vans within 15 km" and gives metres directly.
- SQL reporting for the internship report (revenue, kWh, SLA) without an aggregation pipeline.

What we lose: TTL indexes (replaced by one `pg_cron` job), schema flexibility we never needed, and a small amount of Mongo familiarity.

**Query layer:** Drizzle for schema, migrations, and transactional queries; `supabase-js` only for Auth and Realtime. Drizzle gives typed SQL and real transactions; `supabase-js` alone cannot do multi-statement transactions without an RPC function. Two libraries, each doing what it is good at.

### 6.2 Auth — Supabase Auth

Supabase Auth covers everything `docs/SECURITY.md` requires:

| Requirement | Supabase Auth |
| --- | --- |
| Email + password | Yes |
| Google OAuth | Yes |
| Email verification | Yes |
| Password reset | Yes |
| TOTP MFA + recovery codes | Yes (Basic MFA + recovery codes, free) |
| Session revocation | Self-service global sign-out; admin ban blocks refresh. Revoking *another* user's sessions immediately needs a small `session_version` claim (see risk 9.12) |
| Ban / unban | Yes (`ban_duration` on the user) |
| Custom SMTP (Resend) | Yes, included on free |
| JWT with `aal` claim | Yes — admin MFA can be enforced from the token |
| Leaked-password check | **No on Free** (Pro feature) — mitigate with an app-side HIBP k-anonymity check |
| Auth audit logs | 1 hour on free (enough for a demo, not production) |

Downgrade vs Better Auth: we no longer own the user table (it lives in `auth.users`), and customisation is via hooks rather than code. For this project that is a feature, not a bug.

**Critical rule:** roles live in `public.profiles.role`, never in `user_metadata` (user-writable). A custom access-token hook injects the role into the JWT for RLS; the server always re-reads the role from the database for authorization, per `AGENTS.md` rule 4.

### 6.3 Realtime — Supabase Realtime

Replace Ably with Supabase Realtime **private Broadcast channels**:

- Server publishes minimal events (no PII) via Supabase's HTTP broadcast API — works from Vercel serverless, no long-lived server socket.
- Clients subscribe with their Supabase JWT; `realtime.messages` RLS policies decide who may listen to `booking:{id}` and `van:{id}:location`.
- Clients cannot publish: the policy allows inserts only for the service role.
- **No token endpoint at all** — `supabase.realtime.setAuth(jwt)` reuses the auth session.
- Keep the SWR polling fallback exactly as designed.

Trade-off: 2M messages/month and 200 concurrent connections on free, vs Ably's 6M/200. At demo scale (location every 10s only during an active job), this is thousands of messages, not millions.

Do **not** use Postgres Changes for booking updates: it ships full rows, which risks leaking phone numbers. Broadcast with a hand-built DTO keeps payloads minimal, same as the Ably design.

### 6.4 Storage — not in v1

`docs/PRODUCT.md` explicitly excludes file uploads. Supabase's 1 GB free storage is a bonus for later (driver documents, profile photos), not a reason to switch. Your storage experience transfers when we add it post-MVP.

### 6.5 Maps — keep Google

The only service that requires a card, and it did before this review. Nothing in the Supabase switch changes that.

| Option | Card | India quality | Work to switch | Verdict |
| --- | --- | --- | --- | --- |
| Google Maps + Places + Directions | Yes | Best | — | **Keep.** Already budgeted and documented |
| Mapbox | Yes | Good | Medium | No advantage |
| MapLibre + OSM tiles + Nominatim | No | Weak geocoding in India | High (custom map, no ETA, usage policy) | Only if a card is a hard blocker |

Mitigations stay as written: referrer-restricted browser key, API-restricted server key, per-API daily quotas, 60s ETA cache, budget alerts. Google's free monthly per-SKU usage covers a demo; the risk is a leaked key, so quotas are mandatory.

### 6.6 Email — keep Resend

- Supabase Auth can use **custom SMTP**, so point it at Resend's SMTP endpoint. One email vendor for both auth and booking mail, and it bypasses Supabase's built-in email rate limit (which would otherwise break a live demo).
- Booking/receipt emails stay React Email + Resend API.
- Drop the Brevo backup for v1. One provider + a console fallback is enough.

### 6.7 Payments — keep Razorpay test mode

Unchanged. The security design actually gets stronger on Postgres: `unique(order_id)`, `unique(payment_id)`, `unique(event_id)`, `CHECK` constraints on amounts, and a transaction for payment + booking updates.

### 6.8 Hosting — keep Vercel

No reason to move. Vercel Hobby is non-commercial; an internship demo qualifies. Cloudflare/OpenNext or Render would add work without removing a vendor.

Use the Supabase **transaction pooler** (port 6543) from serverless functions with `prepare: false` and a small pool; use the direct connection (port 5432) only for migrations.

---

## 7. Recommended stack in full

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Next.js App Router | 16.4.5 |
| UI | React | 19.3.1 |
| Language | TypeScript (strict) | 7.0.2 — see risk 9.8 |
| Styling | Tailwind CSS | 4.3.4 |
| Components | Hand-written shadcn-style primitives (`cva` + Radix Slot) | — |
| Validation | Zod | 4.6.7 |
| Database | Supabase Postgres (Mumbai) | — |
| Query layer | Drizzle ORM + `postgres.js` | 0.45.4 / 3.4.9 (v4 after a smoke test) |
| Auth | Supabase Auth (`@supabase/ssr`) | 0.12.7 |
| Realtime | Supabase Realtime (private Broadcast) | supabase-js 2.119.0 |
| Geo | PostGIS | Supabase extension |
| Retention | pg_cron | Supabase extension |
| Maps | Google Maps Platform | — |
| Payments | Razorpay test mode | — |
| Email | Resend + React Email | — |
| Hosting | Vercel Hobby | — |

**Removed:** MongoDB Atlas, Mongoose, Better Auth, Ably, Brevo backup, Sentry (defer to polish week).

**Env vars (replaces the Mongo/Ably set):**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # safe in the browser; RLS applies
SUPABASE_SECRET_KEY=                    # server only; bypasses RLS
DATABASE_URL=                           # pooler, transaction mode, 6543
DIRECT_DATABASE_URL=                    # migrations only, 5432
```

Older projects label these keys `anon` and `service_role`; new projects issue `sb_publishable_…` and `sb_secret_…`. Same roles, new names.

### Architecture shape (unchanged in spirit)

The browser still never queries tables directly. Route handlers and server components call the service layer; the service layer authorizes the actor and runs parameterised SQL through Drizzle. Supabase's SDK is used in the browser for **Auth and Realtime only**.

RLS is **defence in depth for the browser-facing surface**, not a replacement for service authorization:

- The server connects as the database owner, which bypasses RLS.
- RLS policies protect the realtime channels and make it impossible for a leaked anon key to read another customer's booking.
- Every service function still receives an `Actor` and checks role + ownership, exactly as `AGENTS.md` requires.

### Data model sketch (abridged — vehicles, payments, events, and notifications omitted)

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer'
    check (role in ('customer','driver','dispatcher','admin')),
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table vans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'offline',
  connector_types text[] not null,
  capacity_kwh numeric(6,2) not null,
  current_kwh numeric(6,2) not null,
  location geography(Point,4326) not null,
  active boolean not null default true
);
create index vans_location_gix on vans using gist (location);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  customer_id uuid not null references profiles(id),
  vehicle_id uuid not null references vehicles(id),
  van_id uuid references vans(id),
  driver_id uuid references profiles(id),
  status text not null default 'requested',
  base_fee_paise integer not null check (base_fee_paise >= 0),
  per_kwh_paise integer not null check (per_kwh_paise > 0),
  estimated_total_paise integer not null check (estimated_total_paise > 0),
  final_total_paise integer check (final_total_paise > 0),
  payment_status text not null default 'pending',
  idempotency_key text,
  created_at timestamptz not null default now()
);
create unique index bookings_idem
  on bookings (customer_id, idempotency_key)
  where idempotency_key is not null;
```

Rules: money and status are columns (constrained, queryable); free-form metadata is `jsonb`. Never a float.

### Dispatch query

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

### Retention + keep-alive

```sql
select cron.schedule(
  'purge-driver-locations', '0 3 * * *',
  $$ delete from driver_locations where created_at < now() - interval '30 days' $$
);
```

The same daily Vercel Cron that purges data also counts as project activity, which **prevents the free-tier pause** — the risk solves itself with a job we already planned.

### RLS example (realtime authorization)

```sql
alter table bookings enable row level security;

create policy "customers read own bookings" on bookings
  for select using (customer_id = auth.uid());

create policy "drivers read assigned bookings" on bookings
  for select using (driver_id = auth.uid());

create policy "ops read active bookings" on bookings
  for select using (
    public.actor_role() = 'admin'
    or (
      public.actor_role() = 'dispatcher'
      and status in ('requested','assigned','en_route','arrived','charging')
    )
  );
```

`actor_role()` is a `security definer` function reading `profiles`, to avoid recursive policies. (Do not name it `current_role` — that is a reserved SQL keyword.)

Supabase exposes a PostgREST endpoint that anyone with the public anon key can call. That is safe **only** because of RLS, so the rule is: every table gets `enable row level security` in the same migration that creates it, and no policy means no access. Server code bypasses RLS, so this is purely the browser-facing safety net.

---

## 8. Alternatives considered and rejected

| Option | Why not |
| --- | --- |
| **Firebase** (Firestore + Auth + Realtime) | Replaces the same three layers, but NoSQL again, weak relational integrity for payments, security rules are per-document and awkward to test, and Google lock-in is stronger |
| **Appwrite** | Similar bundle to Supabase, smaller ecosystem, fewer Postgres/RLS guarantees, another vendor to learn |
| **PocketBase** | One binary, SQLite, auth + realtime + storage; excellent for tiny demos, but self-hosted ops, no managed backups, no PostGIS |
| **MERN** (Express + Mongo + Socket.IO) | Two deploys, more code, no managed auth, no serverless fit |
| **Clerk + Neon** | Great auth DX, but a fourth vendor for something Supabase includes |
| **Turso/SQLite** | No PostGIS, no managed RLS, auth still separate |

---

## 9. Risks and mitigations (honest list)

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| 9.1 | Free project pauses after 7 days idle | Demo 404s | Daily Vercel Cron purge job = activity; unpause is one click; keep a backup demo video |
| 9.2 | No automatic backups on free | Data loss | Nightly `pg_dump` via GitHub Actions to an encrypted artifact; test one restore |
| 9.3 | No leaked-password protection on free | Weak passwords | App-side HIBP k-anonymity check at sign-up; document the gap |
| 9.4 | RLS policies are fiddly (recursion, `auth.uid()` casts) | Time sink | Use `security definer` helpers; 4–5 focused policies; integration tests with two users |
| 9.5 | Realtime free quota (2M msgs, 200 connections) | Connection drops | Publish only during active jobs; 10s throttle; SWR polling fallback already designed |
| 9.6 | Pooler + serverless transaction pitfalls | Failed writes | Transaction pooler, `prepare: false`, `max: 1` per instance; direct connection for migrations |
| 9.7 | BaaS coupling | Hard to leave | All SQL behind `modules/*/repository.ts`; no `supabase.from()` outside auth/realtime |
| 9.8 | TypeScript 7 is the new native compiler | Toolchain breakage | 30-minute spike; fall back to TypeScript 6.x if `eslint-config-next` or Next's type check rejects it. Not stack-defining |
| 9.9 | Google Maps billing | Silent charges | Quotas, key restrictions, budget alerts — unchanged from the current plan |
| 9.10 | Auth emails rate-limited if built-in SMTP is used | Demo sign-ups fail | Custom SMTP through Resend from day one |
| 9.11 | Free plan allows only 2 active projects | No separate preview/prod DB | Local = Supabase CLI in Docker; cloud project = demo. Previews share the demo project or run without a DB until go-live |
| 9.12 | No first-class "revoke all sessions for user X" on free | A stolen session can outlive a ban by up to the 1h token TTL | Add `profiles.session_version` + a custom access-token claim; bump it on ban/role change and reject stale tokens in `requireSession()` |

**Cost of switching:** ~1–2 days (docs + schema + RLS + auth wiring), offset by ~2 days of Better Auth and Ably work we no longer do. Net effort is roughly neutral; the gain is fewer moving parts and a stronger data model.

---

## 10. What changes in the docs

| Doc | Change |
| --- | --- |
| `AGENTS.md` | Rule 2 (no Mongo in browser → no service-role key in browser); rule 10 (Mongo `_demo` suffix → dedicated demo project + project-ref allowlist); data conventions (Postgres, `timestamptz`, PostGIS, RLS); commands (`db:generate`, `db:migrate`, `db:reset`) |
| `docs/ARCHITECTURE.md` | Stack table, repository shape, data model, dispatch query, auth/session, realtime, env vars, ADR 002/003/004/008 |
| `docs/SECURITY.md` | Replace "MongoDB has no RLS" with "RLS is defence in depth"; add `auth.users`/`profiles` role model, `aal` enforcement, service-role key handling, RLS tests |
| `docs/PRODUCT.md` | Decisions table: database, auth, realtime |
| `docs/ROADMAP.md` | Phase 0: Supabase project, migrations, RLS, keep-alive cron |
| `.env.example` | Supabase URL + publishable/secret keys, `DATABASE_URL`, `DIRECT_DATABASE_URL`; remove Mongo/Ably |
| `.opencode/skills/evgo-security/` | Mongo-specific checks → RLS/service-role checks |

**Unchanged:** product scope, roles, journeys, booking state machine, dispatch rules, location privacy, demo-mode guards, payment verification, rate limits. Only the data/auth/transport layer moves.

---

## 11. Recommendation

**Adopt B — Supabase-native.**

Reasons, in order:

1. It removes two subsystems (auth sessions, realtime transport) and two vendors without adding a new failure mode.
2. Postgres is a better fit for money, audit, and RBAC than a document store, and PostGIS covers dispatch cleanly.
3. It is the smallest total surface for a solo 6–8 week build: one dashboard, one provider to secure, one backup story, one place where access rules live.
4. The free tier is sufficient for the demo, and the only serious risk (pause) is fixed by a cron job we already need.
5. You already know Supabase, which removes most of the RLS learning risk.

**Choose C instead if** you want the auth layer to be your own code (a stronger "I built it" story for the report) and are willing to keep Ably. **Choose A if** you want the existing docs untouched and value Atlas's no-pause guarantee above vendor count.

If you approve B, execution starts with a 1-day foundation: Supabase project (Mumbai) → schema + RLS migrations → auth config (verification, Google, TOTP, Resend SMTP) → Next scaffold → the landing page we already designed. Nothing we have built so far is thrown away: the design system, tokens, copy, and block structure are unaffected.
