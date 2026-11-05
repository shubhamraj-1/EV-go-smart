-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
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
create index if not exists payments_booking_idx on public.payments (booking_id);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'razorpay',
  event_id text not null unique,
  type text not null,
  payload_hash text not null,
  status text not null default 'processed'
    check (status in ('processed','ignored','failed')),
  processed_at timestamptz not null default now()
);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  status text not null default 'pending'
    check (status in ('pending','sent','failed')),
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Pricing
create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  base_fee_paise integer not null check (base_fee_paise >= 0),
  per_kwh_paise integer not null check (per_kwh_paise > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists pricing_rules_city_idx on public.pricing_rules (city, active);

create table if not exists public.service_areas (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  polygon geography(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now()
);
