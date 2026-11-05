-- Phase 3: RLS for payments/notifications/pricing/service_areas.
-- Server uses the secret key (bypasses RLS); these policies gate the
-- publishable-key surface (Auth/Realtime) if it ever touches these tables.
-- Default: no access. Grants below are intentionally minimal.

alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.notifications enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.service_areas enable row level security;

-- Payments: customer reads own (via booking), ops reads all. No client writes.
drop policy if exists "own payments read" on public.payments;
create policy "own payments read"
  on public.payments for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = public.payments.booking_id
        and b.customer_id = auth.uid()
    )
  );

drop policy if exists "ops payments read" on public.payments;
create policy "ops payments read"
  on public.payments for select
  to authenticated
  using (public.actor_role() in ('dispatcher', 'admin'));

-- Notifications: own rows only.
drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Pricing + service areas: public read (for estimates), no writes.
drop policy if exists "pricing public read" on public.pricing_rules;
create policy "pricing public read"
  on public.pricing_rules for select
  to anon, authenticated
  using (active = true);

drop policy if exists "service areas public read" on public.service_areas;
create policy "service areas public read"
  on public.service_areas for select
  to anon, authenticated
  using (true);

-- webhook_events: no client access at all (no policy = no access).
