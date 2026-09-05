begin;

alter table public.hotel_channel_reservation_events
  add column if not exists provider_ack_status text not null default 'PENDING',
  add column if not exists provider_acknowledged_at timestamptz,
  add column if not exists provider_ack_error_code text,
  add column if not exists provider_ack_error_message text,
  add column if not exists provider_ack_detail jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.hotel_channel_reservation_events'::regclass
      and conname = 'hotel_channel_reservation_events_provider_ack_status_check'
  ) then
    alter table public.hotel_channel_reservation_events
      add constraint hotel_channel_reservation_events_provider_ack_status_check
      check (provider_ack_status in ('PENDING','ACKNOWLEDGED','SUPERSEDED','RETRY_REQUIRED'));
  end if;
end;
$$;

create index if not exists hotel_channel_reservation_events_ack_attention_idx
  on public.hotel_channel_reservation_events(
    organization_id,
    property_id,
    provider_ack_status,
    received_at desc
  );

commit;
