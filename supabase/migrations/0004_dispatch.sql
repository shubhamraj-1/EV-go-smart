-- Phase 2A: dispatch core — vans, driver_profiles, driver_locations, audit_logs.
-- Server-side service layer enforces Actor + ownership; RLS is the second layer.
-- Money stays integer paise (bookings); locations are PostGIS geography(Point,4326).

create extension if not exists "postgis";

-- ---------------------------------------------------------------------------
-- driver_profiles: one row per driver. verification_status is admin-controlled.
-- ---------------------------------------------------------------------------
create table if not exists public.driver_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null,
  license_number text not null,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','suspended')),
  rating numeric(2,1) not null default 5.0 check (rating >= 0 and rating <= 5),
  total_trips integer not null default 0 check (total_trips >= 0),
  current_van_id uuid,
  status text not null default 'offline'
    check (status in ('offline','available','busy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists driver_profiles_status_idx on public.driver_profiles (status);
create trigger driver_profiles_set_updated_at
  before update on public.driver_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- vans: fleet. status lifecycle mirrors docs/ARCHITECTURE.md.
-- ---------------------------------------------------------------------------
create table if not exists public.vans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  driver_id uuid references public.profiles (id),
  status text not null default 'offline'
    check (status in ('offline','available','assigned','en_route','charging','returning','maintenance')),
  connector_types text[] not null,
  capacity_kwh numeric(6,2) not null check (capacity_kwh > 0),
  current_kwh numeric(6,2) not null check (current_kwh >= 0),
  location geography(Point,4326) not null,
  location_updated_at timestamptz not null default now(),
  city text not null default 'Bengaluru',
  rating numeric(2,1) not null default 5.0 check (rating >= 0 and rating <= 5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vans_location_gix on public.vans using gist (location);
create index if not exists vans_status_city_idx on public.vans (status, city);
create index if not exists vans_driver_idx on public.vans (driver_id);
-- Partial index for the hot candidate search path.
create index if not exists vans_available_idx
  on public.vans (status, city)
  where active and status = 'available';
create trigger vans_set_updated_at
  before update on public.vans
  for each row execute function public.set_updated_at();

-- driver_profiles.current_van_id can only be set after vans exists.
alter table public.driver_profiles
  add constraint driver_profiles_current_van_fkey
  foreign key (current_van_id) references public.vans (id) on delete set null;

-- ---------------------------------------------------------------------------
-- driver_locations: 30-day retention via pg_cron (Phase 4). Never logged.
-- ---------------------------------------------------------------------------
create table if not exists public.driver_locations (
  id bigserial primary key,
  van_id uuid not null references public.vans (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  location geography(Point,4326) not null,
  heading smallint check (heading is null or (heading >= 0 and heading <= 359)),
  created_at timestamptz not null default now()
);
create index if not exists driver_locations_van_time_idx on public.driver_locations (van_id, created_at desc);
create index if not exists driver_locations_created_idx on public.driver_locations (created_at);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only privileged actions. No update/delete for authenticated.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  actor_role text,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb, -- redacted: no precise coords, no PII beyond ids
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- RLS: browser read-only, scoped by ownership/role. Writes via service role.
-- ---------------------------------------------------------------------------
alter table public.driver_profiles enable row level security;
alter table public.vans enable row level security;
alter table public.driver_locations enable row level security;
alter table public.audit_logs enable row level security;

-- driver_profiles: self + ops read; no client writes.
drop policy if exists "own driver profile" on public.driver_profiles;
create policy "own driver profile" on public.driver_profiles
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ops read driver profiles" on public.driver_profiles;
create policy "ops read driver profiles" on public.driver_profiles
  for select to authenticated
  using (public.actor_role() in ('dispatcher','admin'));

-- vans: ops sees all; driver sees own; customer never sees vans directly.
drop policy if exists "drivers read own van" on public.vans;
create policy "drivers read own van" on public.vans
  for select to authenticated using (driver_id = auth.uid());

drop policy if exists "ops read vans" on public.vans;
create policy "ops read vans" on public.vans
  for select to authenticated
  using (public.actor_role() in ('dispatcher','admin'));

-- driver_locations: assigned customer/driver + ops only. No client writes.
drop policy if exists "assigned read locations" on public.driver_locations;
create policy "assigned read locations" on public.driver_locations
  for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.bookings b
      where b.driver_id = driver_locations.driver_id
        and b.van_id = driver_locations.van_id
        and b.customer_id = auth.uid()
        and b.status in ('assigned','en_route','arrived','charging')
    )
  );

drop policy if exists "ops read locations" on public.driver_locations;
create policy "ops read locations" on public.driver_locations
  for select to authenticated
  using (public.actor_role() in ('dispatcher','admin'));

-- audit_logs: admin read only (aal2 enforced server-side). No authenticated writes.
drop policy if exists "admin read audit" on public.audit_logs;
create policy "admin read audit" on public.audit_logs
  for select to authenticated
  using (public.actor_role() = 'admin');

-- ---------------------------------------------------------------------------
-- booking_events: drivers read events for assigned bookings (customer policy exists).
-- ---------------------------------------------------------------------------
drop policy if exists "drivers read assigned booking events" on public.booking_events;
create policy "drivers read assigned booking events" on public.booking_events
  for select to authenticated
  using (booking_id in (select id from public.bookings where driver_id = auth.uid()));

drop policy if exists "ops read booking events" on public.booking_events;
create policy "ops read booking events" on public.booking_events
  for select to authenticated
  using (
    public.actor_role() = 'admin'
    or (
      public.actor_role() = 'dispatcher'
      and booking_id in (
        select id from public.bookings
        where status in ('requested','assigned','en_route','arrived','charging')
      )
    )
  );
