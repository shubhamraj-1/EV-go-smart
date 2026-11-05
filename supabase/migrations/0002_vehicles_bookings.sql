-- Phase 1: vehicles + bookings + booking_events + RLS.
-- Roles/ownership enforced server-side (service layer); RLS is the second layer.

create extension if not exists "postgis";

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  make text not null,
  model text not null,
  year smallint not null check (year between 2008 and 2100),
  connector_type text not null
    check (connector_type in ('CCS2','CHAdeMO','Type2','Other')),
  battery_kwh numeric(6,2) not null check (battery_kwh > 0 and battery_kwh <= 500),
  license_plate text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vehicles_user_idx on public.vehicles (user_id, created_at desc);
create unique index if not exists vehicles_plate_idx on public.vehicles (user_id, license_plate);
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create sequence if not exists booking_ref_seq;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default 'EVG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_ref_seq')::text, 6, '0'),
  customer_id uuid not null references public.profiles (id),
  vehicle_id uuid not null references public.vehicles (id),
  van_id uuid,
  driver_id uuid references public.profiles (id),
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
  estimated_kwh numeric(6,2) not null check (estimated_kwh > 0),
  estimated_total_paise integer not null check (estimated_total_paise > 0),
  delivered_kwh numeric(6,2) check (delivered_kwh is null or delivered_kwh >= 0),
  final_total_paise integer check (final_total_paise is null or final_total_paise > 0),
  completed_at timestamptz,
  payment_status text not null default 'pending'
    check (payment_status in ('not_required','pending','paid','failed','refunded','partially_refunded')),
  dispatch_attempts integer not null default 0,
  assigned_at timestamptz,
  eta_minutes integer,
  eta_updated_at timestamptz,
  rating_score smallint check (rating_score is null or (rating_score between 1 and 5)),
  rating_comment text,
  rating_created_at timestamptz,
  cancel_reason text,
  cancelled_by uuid references public.profiles (id),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index if not exists bookings_driver_idx on public.bookings (driver_id, created_at desc);
create index if not exists bookings_status_idx on public.bookings (status, created_at desc);
create index if not exists bookings_location_gix on public.bookings using gist (location);
create unique index if not exists bookings_idem_idx
  on public.bookings (customer_id, idempotency_key)
  where idempotency_key is not null;
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create table if not exists public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  type text not null,
  from_status text,
  to_status text,
  actor_id uuid references public.profiles (id),
  actor_role text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists booking_events_booking_idx on public.booking_events (booking_id, created_at);

-- RLS: browser is read-only for own rows; writes go through the
-- server (service role) which validates Actor + ownership.
alter table public.vehicles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

drop policy if exists "customers read own vehicles" on public.vehicles;
create policy "customers read own vehicles" on public.vehicles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "customers read own bookings" on public.bookings;
create policy "customers read own bookings" on public.bookings
  for select to authenticated using (customer_id = auth.uid());

drop policy if exists "drivers read assigned bookings" on public.bookings;
create policy "drivers read assigned bookings" on public.bookings
  for select to authenticated using (driver_id = auth.uid());

drop policy if exists "ops read bookings" on public.bookings;
create policy "ops read bookings" on public.bookings
  for select to authenticated
  using (
    public.actor_role() = 'admin'
    or (
      public.actor_role() = 'dispatcher'
      and status in ('requested','assigned','en_route','arrived','charging')
    )
  );

drop policy if exists "customers read own booking events" on public.booking_events;
create policy "customers read own booking events" on public.booking_events
  for select to authenticated
  using (booking_id in (select id from public.bookings where customer_id = auth.uid()));
