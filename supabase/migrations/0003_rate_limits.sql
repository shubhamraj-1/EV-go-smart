-- Phase 1: rate limit counters for public/abusable endpoints.
-- Server-only (service role writes); no browser access. Fixed-window counters.

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rate_limits_reset_idx on public.rate_limits (reset_at);

create trigger rate_limits_set_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();

alter table public.rate_limits enable row level security;

-- No policies: server (service role) bypasses RLS; the browser never
-- reads or writes this table.
