-- Hotel cross-device readiness invalidation.
-- Browsers may receive an organization-scoped invalidation signal only.
-- They cannot publish readiness signals and receive no Hotel operational row data.

drop policy if exists "Hotel organization members can receive readiness broadcasts"
  on realtime.messages;

create policy "Hotel organization members can receive readiness broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part((select realtime.topic()), ':', 1) = 'hotel'
  and split_part((select realtime.topic()), ':', 3) = 'readiness'
  and split_part((select realtime.topic()), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.same_organization(split_part((select realtime.topic()), ':', 2)::uuid)
);
