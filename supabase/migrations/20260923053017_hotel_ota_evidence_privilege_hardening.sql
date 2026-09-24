-- Canonicalize the production-only OTA evidence privilege hardening.
-- Browser roles never mutate/read these transport evidence tables directly.

revoke all on table public.hotel_channel_reservation_events
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.hotel_channel_reservation_events
  to service_role;

revoke all on table public.hotel_channel_reservation_reconciliations
  from public, anon, authenticated, service_role;
grant select, insert on table public.hotel_channel_reservation_reconciliations
  to service_role;

revoke all on table public.hotel_channel_transmissions
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.hotel_channel_transmissions
  to service_role;
