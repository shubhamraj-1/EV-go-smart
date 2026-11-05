-- Phase 2A: Supabase Realtime private channels (RLS on realtime.messages).
-- Clients never publish; server publishes via the broadcast REST API with the
-- secret key. Channels are private and authorized by RLS per topic prefix.
--
-- Channel naming (docs/ARCHITECTURE.md):
--   booking:{bookingId}          — customer, assigned driver, dispatcher, admin
--   van:{vanId}:location         — assigned customer, dispatcher, admin
--   driver:{driverId}:jobs       — that driver only
--   dispatch:queue               — dispatcher, admin
--
-- Policy model: realtime.messages is a partitioned table owned by
-- supabase_realtime_admin. We add SELECT policies (receive) for each prefix.
-- INSERT is intentionally not granted to `authenticated` (server publishes).

-- Enable Realtime on the messages table for supabase-js (requires publication).
-- In Supabase-managed projects this is automatic; guarded for local dev.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table realtime.messages;
  end if;
exception when duplicate_object then
  null;
when others then
  null;
end $$;

-- Booking channel: customer owns it, driver assigned, ops active.
drop policy if exists "booking channel read" on realtime.messages;
create policy "booking channel read" on realtime.messages
  for select
  to authenticated
  using (
    topic like 'booking:%'
    and (
      public.actor_role() in ('dispatcher','admin')
      or exists (
        select 1 from public.bookings b
        where b.id::text = split_part(topic, ':', 2)
          and (b.customer_id = auth.uid() or b.driver_id = auth.uid())
      )
    )
  );

-- Van location: assigned customer (via active booking), ops. Never all vans for customers.
drop policy if exists "van location read" on realtime.messages;
create policy "van location read" on realtime.messages
  for select
  to authenticated
  using (
    topic like 'van:%:location'
    and (
      public.actor_role() in ('dispatcher','admin')
      or exists (
        select 1 from public.bookings b
        where b.van_id::text = split_part(topic, ':', 2)
          and b.customer_id = auth.uid()
          and b.status in ('assigned','en_route','arrived','charging')
      )
    )
  );

-- Driver jobs: self only.
drop policy if exists "driver jobs read" on realtime.messages;
create policy "driver jobs read" on realtime.messages
  for select
  to authenticated
  using (
    topic like 'driver:%:jobs'
    and auth.uid()::text = split_part(topic, ':', 2)
  );

-- Dispatch queue: dispatcher + admin (aal2 enforced server-side for admin).
drop policy if exists "dispatch queue read" on realtime.messages;
create policy "dispatch queue read" on realtime.messages
  for select
  to authenticated
  using (
    topic = 'dispatch:queue'
    and public.actor_role() in ('dispatcher','admin')
  );
