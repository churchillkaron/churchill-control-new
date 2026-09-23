begin;

alter table public.developer_webhook_deliveries
  add column if not exists replay_of_delivery_id uuid null references public.developer_webhook_deliveries(id) on delete set null,
  add column if not exists replay_key text null;

drop index if exists public.developer_webhook_delivery_event_endpoint_uidx;

create unique index if not exists developer_webhook_delivery_event_endpoint_uidx
  on public.developer_webhook_deliveries (event_record_id, endpoint_id)
  where event_record_id is not null and replay_of_delivery_id is null;

create unique index if not exists developer_webhook_delivery_replay_key_uidx
  on public.developer_webhook_deliveries (organization_id, replay_key)
  where replay_key is not null;

create index if not exists developer_webhook_delivery_replay_of_idx
  on public.developer_webhook_deliveries (replay_of_delivery_id, created_at desc)
  where replay_of_delivery_id is not null;

alter table public.developer_webhook_deliveries
  drop constraint if exists developer_webhook_delivery_replay_key_length;

alter table public.developer_webhook_deliveries
  add constraint developer_webhook_delivery_replay_key_length
  check (replay_key is null or length(replay_key) between 8 and 200);

commit;
